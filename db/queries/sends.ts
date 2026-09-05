import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import { areas, climbs, sends, user } from "@/db/schema";
import {
  DEFAULT_BOULDER_RANGE,
  DEFAULT_SPORT_RANGE,
  DEFAULT_TRAD_RANGE,
  type DisciplineFilter,
} from "@/lib/discipline-filter";
import { formatGrade, type ClimbType } from "@/lib/grades";
import { ASCENT_STYLES, GRADE_FEEL_OFFSET, type AscentStyle, type GradeFeel } from "@/lib/sends";

import { areaNameCondition } from "./areas";
import type { Climb } from "./climbs";
import { journalVisibleSql } from "./journal-access";
import { disciplineGradeCondition, toFtsPrefixQuery } from "./shared";

export type Send = typeof sends.$inferSelect;

export type EditableSend = Pick<
  Send,
  "id" | "ascentStyle" | "dateSent" | "comment" | "rating" | "suggestedGrade" | "gradeFeel"
>;

export type SendableClimb = Pick<Climb, "id" | "areaId" | "type" | "grade">;

export async function getUserSendForClimb(
  db: Database,
  userId: string,
  climbId: number,
): Promise<Send | undefined> {
  return db
    .select()
    .from(sends)
    .where(and(eq(sends.userId, userId), eq(sends.climbId, climbId)))
    .get();
}

/** Fields crossing the sends JSON endpoint; excludes Date-valued database timestamps. */
export type ClimbSendRow = EditableSend & { userId: string; userName: string };

export const CLIMB_SENDS_PAGE_SIZE = 10;

export type ClimbSendsPage = { sends: ClimbSendRow[]; hasMore: boolean };

/** Newest first, with ID breaking date ties. Private authors are visible only
 * to themselves; anonymous aggregate statistics still include their sends. */
export async function getSendsForClimb(
  db: Database,
  climbId: number,
  offset = 0,
  pageSize: number = CLIMB_SENDS_PAGE_SIZE,
  viewerId: string | null = null,
): Promise<ClimbSendsPage> {
  const visibilityCondition = viewerId
    ? sql`(user.is_private = 0 OR sends.user_id = ${viewerId})`
    : sql`user.is_private = 0`;

  const rows = await db
    .select({
      id: sends.id,
      userId: sends.userId,
      userName: user.name,
      ascentStyle: sends.ascentStyle,
      dateSent: sends.dateSent,
      comment: sql<
        string | null
      >`CASE WHEN ${journalVisibleSql(viewerId, sql`sends.user_id`)} THEN ${sends.comment} ELSE NULL END`,
      rating: sends.rating,
      suggestedGrade: sends.suggestedGrade,
      gradeFeel: sends.gradeFeel,
    })
    .from(sends)
    .innerJoin(user, eq(sends.userId, user.id))
    .where(and(eq(sends.climbId, climbId), visibilityCondition))
    .orderBy(desc(sends.dateSent), asc(sends.id))
    .limit(pageSize + 1)
    .offset(offset);

  const hasMore = rows.length > pageSize;
  return { sends: hasMore ? rows.slice(0, pageSize) : rows, hasMore };
}

export type SuggestedGradeCount = { grade: number; feel: GradeFeel; count: number };

export type ClimbSendSummary = ClimbSendStats & {
  styleBreakdown: Record<AscentStyle, number>;
  suggestedGradeCounts: SuggestedGradeCount[];
};

/** Whole-history aggregates, independent of the paginated send list. */
export async function getClimbSendSummary(
  db: Database,
  climbId: number,
): Promise<ClimbSendSummary> {
  const styleBreakdown = Object.fromEntries(ASCENT_STYLES.map((style) => [style, 0])) as Record<
    AscentStyle,
    number
  >;

  const [stats, styleRows, suggestedGradeCounts] = await Promise.all([
    getClimbSendStats(db, [climbId]),
    db.all<{ ascentStyle: AscentStyle; count: number }>(sql`
      SELECT ascent_style AS ascentStyle, COUNT(*) AS count
      FROM sends
      WHERE climb_id = ${climbId}
      GROUP BY ascent_style
    `),
    db.all<SuggestedGradeCount>(sql`
      SELECT suggested_grade AS grade, grade_feel AS feel, COUNT(*) AS count
      FROM sends
      WHERE climb_id = ${climbId} AND suggested_grade IS NOT NULL
      GROUP BY suggested_grade, grade_feel
    `),
  ]);
  for (const row of styleRows) {
    styleBreakdown[row.ascentStyle] = row.count;
  }

  return { ...stats[climbId], styleBreakdown, suggestedGradeCounts };
}

/** Pass climbIds for list pages to bound the lookup to the displayed climbs. */
export async function getUserSentClimbIds(
  db: Database,
  userId: string,
  climbIds?: readonly number[],
): Promise<Set<number>> {
  const distinctIds = climbIds ? [...new Set(climbIds)] : undefined;
  if (distinctIds?.length === 0) return new Set();

  // A single JSON binding avoids D1's parameter limit.
  const rows = await db.all<{ climbId: number }>(sql`
    SELECT sends.climb_id AS climbId
    FROM sends
    WHERE sends.user_id = ${userId}
    ${
      distinctIds
        ? sql`AND sends.climb_id IN (
            SELECT CAST(value AS INTEGER) FROM json_each(${JSON.stringify(distinctIds)})
          )`
        : sql``
    }
  `);
  return new Set(rows.map((r) => r.climbId));
}

export type UserSendRow = {
  id: number;
  climbId: number;
  climbName: string;
  climbType: ClimbType;
  climbGrade: number | null;
  areaId: number;
  areaName: string;
  ascentStyle: AscentStyle;
  dateSent: string | null;
  rating: number | null;
  suggestedGrade: number | null;
  gradeFeel: GradeFeel;
  comment: string | null;
};

export type UserSendsSort =
  | "date_desc"
  | "date_asc"
  | "grade_desc"
  | "grade_asc"
  | "rating_desc"
  | "rating_asc";

export type UserSendsFilter = DisciplineFilter & {
  date?: string;
  name?: string;
  areaName?: string;
  sort?: UserSendsSort;
  ascentStyles: AscentStyle[];
  minRating: number;
};

// Unknown values sort last. ID breaks ties in the paginated query.
const USER_SENDS_ORDER_BY: Record<UserSendsSort, SQL> = {
  date_desc: sql`sends.date_sent DESC`,
  date_asc: sql`sends.date_sent ASC NULLS LAST`,
  grade_desc: sql`climbs.grade DESC`,
  grade_asc: sql`climbs.grade ASC NULLS LAST`,
  rating_desc: sql`sends.rating DESC`,
  rating_asc: sql`sends.rating ASC NULLS LAST`,
};

export const USER_SENDS_PAGE_SIZE = 10;

export type UserSendsPage = {
  sends: UserSendRow[];
  hasMore: boolean;
};

function userSendsWhere(userId: string, filter: UserSendsFilter): SQL {
  const disciplineClauses: SQL[] = [];
  if (filter.disciplines.includes("boulder")) {
    disciplineClauses.push(
      disciplineGradeCondition("boulder", filter.boulderRange, DEFAULT_BOULDER_RANGE),
    );
  }
  if (filter.disciplines.includes("sport")) {
    disciplineClauses.push(
      disciplineGradeCondition("sport", filter.sportRange, DEFAULT_SPORT_RANGE),
    );
  }
  if (filter.disciplines.includes("trad")) {
    disciplineClauses.push(disciplineGradeCondition("trad", filter.tradRange, DEFAULT_TRAD_RANGE));
  }
  // No selected disciplines means no discipline filter.
  const disciplineWhere =
    disciplineClauses.length > 0 ? sql`(${sql.join(disciplineClauses, sql` OR `)})` : sql`1`;

  const conditions: SQL[] = [sql`sends.user_id = ${userId}`, disciplineWhere];
  if (filter.date) conditions.push(sql`sends.date_sent = ${filter.date}`);

  if (filter.ascentStyles.length > 0) {
    conditions.push(
      sql`sends.ascent_style IN (${sql.join(
        filter.ascentStyles.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    );
  }

  if (filter.minRating > 0) {
    conditions.push(sql`sends.rating >= ${filter.minRating}`);
  }

  if (filter.name) {
    const nameQuery = toFtsPrefixQuery(filter.name);
    conditions.push(
      nameQuery
        ? sql`sends.climb_id IN (SELECT rowid FROM climbs_fts WHERE climbs_fts MATCH ${nameQuery})`
        : sql`0`,
    );
  }

  const areaCondition = areaNameCondition(filter.areaName);
  if (areaCondition) conditions.push(areaCondition);

  return sql.join(conditions, sql` AND `);
}

function userSendColumns(viewerId: string | null) {
  return sql`
      sends.id AS id,
      sends.climb_id AS climbId,
      climbs.name AS climbName,
      climbs.type AS climbType,
      climbs.grade AS climbGrade,
      climbs.area_id AS areaId,
      areas.name AS areaName,
      sends.ascent_style AS ascentStyle,
      sends.date_sent AS dateSent,
      sends.rating AS rating,
      sends.suggested_grade AS suggestedGrade,
      sends.grade_feel AS gradeFeel,
      CASE WHEN ${journalVisibleSql(viewerId, sql`sends.user_id`)} THEN sends.comment ELSE NULL END AS comment
`;
}

export async function getSendsForUserPage(
  db: Database,
  userId: string,
  filter: UserSendsFilter,
  offset: number,
  pageSize: number = USER_SENDS_PAGE_SIZE,
  viewerId: string | null = null,
): Promise<UserSendsPage> {
  const where = userSendsWhere(userId, filter);

  const rows = await db.all<UserSendRow>(sql`
    SELECT ${userSendColumns(viewerId)}
    FROM sends
    JOIN climbs ON climbs.id = sends.climb_id
    JOIN areas ON areas.id = climbs.area_id
    WHERE ${where}
    ORDER BY ${USER_SENDS_ORDER_BY[filter.sort ?? "date_desc"]}, sends.id DESC
    LIMIT ${pageSize + 1}
    OFFSET ${offset}
  `);

  const hasMore = rows.length > pageSize;
  return { sends: hasMore ? rows.slice(0, pageSize) : rows, hasMore };
}

const EXPORT_SENDS_PAGE_SIZE = 200;
export type UserSendsExportCursor = { dateSent: string | null; id: number };
export type UserSendsExportPage = {
  sends: UserSendRow[];
  nextCursor: UserSendsExportCursor | null;
};

/** Keep dated and undated keyset ranges separate so sends_user_date_idx can
 * seek past user_id; combining them with OR prevents that seek. */
export async function getSendsForUserExportPage(
  db: Database,
  userId: string,
  cursor: UserSendsExportCursor | null,
): Promise<UserSendsExportPage> {
  const rows: UserSendRow[] = [];

  if (cursor === null || cursor.dateSent !== null) {
    const datedRange =
      cursor === null
        ? sql`sends.date_sent IS NOT NULL`
        : sql`sends.date_sent IS NOT NULL
              AND (sends.date_sent, sends.id) < (${cursor.dateSent}, ${cursor.id})`;
    rows.push(...(await getUserExportRows(db, userId, datedRange, EXPORT_SENDS_PAGE_SIZE + 1)));
  }

  // Fill the remaining page slots with undated sends, plus one row for hasMore.
  if (rows.length <= EXPORT_SENDS_PAGE_SIZE) {
    const undatedRange =
      cursor?.dateSent === null
        ? sql`sends.date_sent IS NULL AND sends.id < ${cursor.id}`
        : sql`sends.date_sent IS NULL`;
    rows.push(
      ...(await getUserExportRows(
        db,
        userId,
        undatedRange,
        EXPORT_SENDS_PAGE_SIZE + 1 - rows.length,
      )),
    );
  }

  const hasMore = rows.length > EXPORT_SENDS_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, EXPORT_SENDS_PAGE_SIZE) : rows;
  const last = page.at(-1);
  return {
    sends: page,
    nextCursor: hasMore && last ? { dateSent: last.dateSent, id: last.id } : null,
  };
}

function getUserExportRows(
  db: Database,
  userId: string,
  range: SQL,
  limit: number,
): Promise<UserSendRow[]> {
  return db.all<UserSendRow>(sql`
    SELECT ${userSendColumns(userId)}
    FROM sends INDEXED BY sends_user_date_idx
    JOIN climbs ON climbs.id = sends.climb_id
    JOIN areas ON areas.id = climbs.area_id
    WHERE sends.user_id = ${userId} AND (${range})
    ORDER BY sends.date_sent DESC, sends.id DESC
    LIMIT ${limit}
  `);
}

export type UserStatsSummary = {
  sendCount: number;
  areaCount: number;
  peakGrade: string | null;
  mostLoggedDiscipline: { type: ClimbType; count: number } | null;
  latestSendDate: string | null;
};

type UserSendsTotals = { sendCount: number; areaCount: number; latestSendDate: string | null };
type TopDiscipline = { type: ClimbType; count: number; maxGrade: number | null };

/** Peak grade uses the most-logged discipline; ordinals are not comparable across disciplines. */
export async function getUserSendsSummary(db: Database, userId: string): Promise<UserStatsSummary> {
  const [totals] = await db.all<UserSendsTotals>(sql`
    SELECT
      COUNT(*) AS sendCount,
      COUNT(DISTINCT climbs.area_id) AS areaCount,
      MAX(sends.date_sent) AS latestSendDate
    FROM sends
    JOIN climbs ON climbs.id = sends.climb_id
    WHERE sends.user_id = ${userId}
  `);

  if (!totals || totals.sendCount === 0) {
    return {
      sendCount: 0,
      areaCount: 0,
      peakGrade: null,
      mostLoggedDiscipline: null,
      latestSendDate: null,
    };
  }

  const [topDiscipline] = await db.all<TopDiscipline>(sql`
    SELECT climbs.type AS type, COUNT(*) AS count, MAX(climbs.grade) AS maxGrade
    FROM sends
    JOIN climbs ON climbs.id = sends.climb_id
    WHERE sends.user_id = ${userId}
    GROUP BY climbs.type
    ORDER BY count DESC
    LIMIT 1
  `);

  return {
    sendCount: totals.sendCount,
    areaCount: totals.areaCount,
    latestSendDate: totals.latestSendDate,
    mostLoggedDiscipline: topDiscipline
      ? { type: topDiscipline.type, count: topDiscipline.count }
      : null,
    peakGrade:
      topDiscipline?.maxGrade != null
        ? formatGrade(topDiscipline.type, topDiscipline.maxGrade)
        : null,
  };
}

export type ClimbSendStats = {
  avgRating: number | null;
  sendCount: number;
  avgSuggestedGrade: number | null;
};

/** Pre-seed zero-send climbs because GROUP BY produces no row for them. */
export async function getClimbSendStats(
  db: Database,
  climbIds: number[],
): Promise<Record<number, ClimbSendStats>> {
  const distinctIds = [...new Set(climbIds)];
  const stats: Record<number, ClimbSendStats> = {};
  for (const id of distinctIds) {
    stats[id] = { avgRating: null, sendCount: 0, avgSuggestedGrade: null };
  }
  if (distinctIds.length === 0) return stats;

  const rows = await db.all<{
    climbId: number;
    avgRating: number | null;
    sendCount: number;
    avgSuggestedGrade: number | null;
  }>(sql`
    SELECT climb_id AS climbId, AVG(rating) AS avgRating, COUNT(*) AS sendCount,
           AVG(suggested_grade + CASE grade_feel
                 WHEN 'low' THEN ${GRADE_FEEL_OFFSET.low}
                 WHEN 'high' THEN ${GRADE_FEEL_OFFSET.high}
                 ELSE 0 END) AS avgSuggestedGrade
    FROM sends
    WHERE climb_id IN (
      SELECT CAST(value AS INTEGER) FROM json_each(${JSON.stringify(distinctIds)})
    )
    GROUP BY climb_id
  `);
  for (const row of rows) {
    stats[row.climbId] = {
      avgRating: row.avgRating,
      sendCount: row.sendCount,
      avgSuggestedGrade: row.avgSuggestedGrade,
    };
  }
  return stats;
}

export type AnalyticsSendRow = {
  climbId: number;
  climbName: string;
  climbType: ClimbType;
  /** Analytics uses the climber's suggested grade consistently across charts. */
  suggestedGrade: number | null;
  areaId: number;
  areaName: string;
  ascentStyle: AscentStyle;
  dateSent: string | null;
};

/** Full send history for analytics. Unlike list pages, this loads all of a user's sends. */
export async function getUserSendsForAnalytics(
  db: Database,
  userId: string,
): Promise<AnalyticsSendRow[]> {
  return db
    .select({
      climbId: sends.climbId,
      climbName: climbs.name,
      climbType: climbs.type,
      suggestedGrade: sends.suggestedGrade,
      areaId: climbs.areaId,
      areaName: areas.name,
      ascentStyle: sends.ascentStyle,
      dateSent: sends.dateSent,
    })
    .from(sends)
    .innerJoin(climbs, eq(sends.climbId, climbs.id))
    .innerJoin(areas, eq(climbs.areaId, areas.id))
    .where(eq(sends.userId, userId))
    .orderBy(sends.dateSent, sends.id);
}
