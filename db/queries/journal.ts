import { and, eq, sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import { journalEntries } from "@/db/schema";
import type { ClimbType } from "@/lib/grades";
import type { JournalKind } from "@/lib/journal";
import type { JournalFilter, JournalView } from "@/lib/journal-filter";

import { journalVisibleSql } from "./journal-access";

export type JournalEntry = {
  id: number;
  climbId: number | null;
  kind: JournalKind;
  sent: boolean;
  entryDate: string;
  body: string | null;
  tags: string[];
  climbName: string | null;
  climbType: ClimbType | null;
  climbGrade: number | null;
  areaId: number | null;
  areaName: string | null;
  isAscent: boolean;
};

export type JournalCursor = { entryDate: string; id: number };

export type JournalPage = {
  entries: JournalEntry[];
  hasMore: boolean;
  nextCursor: JournalCursor | null;
};

const JOURNAL_PAGE_SIZE = 20;

type JournalEntryRow = {
  id: number;
  climbId: number | null;
  kind: JournalKind;
  sent: number;
  entryDate: string;
  body: string | null;
  tags: string | null;
  climbName: string | null;
  climbType: ClimbType | null;
  climbGrade: number | null;
  areaId: number | null;
  areaName: string | null;
  isAscent: number;
};

function toJournalEntry(row: JournalEntryRow): JournalEntry {
  return {
    ...row,
    sent: row.sent === 1,
    isAscent: row.isAscent === 1,
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : [],
  };
}

const IS_OPEN_PROJECT = sql`(j.kind = 'session' AND j.climb_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM sends s WHERE s.user_id = j.user_id AND s.climb_id = j.climb_id
    ))`;

const VIEW_CONDITION: Record<JournalView, SQL | null> = {
  all: null,
  sessions: sql`j.kind = 'session'`,
  training: sql`j.kind = 'training'`,
};

function filterConditions(filter: JournalFilter): SQL[] {
  const view = VIEW_CONDITION[filter.view];
  const conditions: SQL[] = view ? [view] : [];

  if (filter.query) {
    conditions.push(sql`(
      instr(lower(COALESCE(climbs.name, '')), lower(${filter.query})) > 0
      OR instr(lower(COALESCE(j.body, '')), lower(${filter.query})) > 0
      OR instr(lower(COALESCE(j.tags, '')), lower(${filter.query})) > 0
      OR EXISTS (
        WITH RECURSIVE ancestors(id, parent_id, name) AS (
          SELECT a.id, a.parent_id, a.name FROM areas a WHERE a.id = climbs.area_id
          UNION ALL
          SELECT parent.id, parent.parent_id, parent.name
          FROM areas parent JOIN ancestors child ON parent.id = child.parent_id
        )
        SELECT 1
        FROM ancestors
        WHERE instr(lower(ancestors.name), lower(${filter.query})) > 0
      )
    )`);
  }
  if (filter.tag) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM json_each(j.tags) WHERE json_each.value = ${filter.tag})`,
    );
  }
  if (filter.climbId !== null) conditions.push(sql`j.climb_id = ${filter.climbId}`);
  if (filter.date) conditions.push(sql`j.entry_date = ${filter.date}`);
  if (filter.year !== null) {
    conditions.push(
      sql`j.entry_date >= ${`${filter.year}-01-01`} AND j.entry_date <= ${`${filter.year}-12-31`}`,
    );
  }
  return conditions;
}

const JOURNAL_ENTRY_SELECT = sql`
    SELECT
      j.id AS id,
      j.climb_id AS climbId,
      j.kind AS kind,
      j.sent AS sent,
      j.entry_date AS entryDate,
      j.body AS body,
      j.tags AS tags,
      climbs.name AS climbName,
      climbs.type AS climbType,
      climbs.grade AS climbGrade,
      climbs.area_id AS areaId,
      areas.name AS areaName,
      j.is_ascent AS isAscent
    FROM journal_entries j
    LEFT JOIN climbs ON climbs.id = j.climb_id
    LEFT JOIN areas ON areas.id = climbs.area_id
`;

export async function getJournalPage(
  db: Database,
  ownerId: string,
  viewerId: string | null,
  filter: JournalFilter,
  cursor: JournalCursor | null = null,
  pageSize: number = JOURNAL_PAGE_SIZE,
): Promise<JournalPage> {
  const conditions = [
    sql`j.user_id = ${ownerId}`,
    journalVisibleSql(viewerId, sql`j.user_id`),
    ...filterConditions(filter),
  ];
  if (cursor) {
    conditions.push(sql`(j.entry_date, j.id) < (${cursor.entryDate}, ${cursor.id})`);
  }

  const rows = await db.all<JournalEntryRow>(sql`
    ${JOURNAL_ENTRY_SELECT}
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY j.entry_date DESC, j.id DESC
    LIMIT ${pageSize + 1}
  `);

  const hasMore = rows.length > pageSize;
  const entries = (hasMore ? rows.slice(0, pageSize) : rows).map(toJournalEntry);
  const last = entries.at(-1);

  return {
    entries,
    hasMore,
    nextCursor: hasMore && last ? { entryDate: last.entryDate, id: last.id } : null,
  };
}

const CLIMB_JOURNAL_ENTRY_LIMIT = 4;

export async function getJournalForClimb(
  db: Database,
  ownerId: string,
  viewerId: string | null,
  climbId: number,
  limit: number = CLIMB_JOURNAL_ENTRY_LIMIT,
): Promise<JournalEntry[]> {
  const rows = await db.all<JournalEntryRow>(sql`
    ${JOURNAL_ENTRY_SELECT}
    WHERE j.user_id = ${ownerId} AND ${journalVisibleSql(viewerId, sql`j.user_id`)} AND j.climb_id = ${climbId}
    ORDER BY j.entry_date DESC, j.id DESC
    LIMIT ${limit}
  `);
  return rows.map(toJournalEntry);
}

export async function getAscentEntryId(
  db: Database,
  ownerId: string,
  climbId: number,
): Promise<number | undefined> {
  const row = await db.get<{ id: number | null }>(sql`
    SELECT j.id AS id
    FROM journal_entries j
    WHERE j.user_id = ${ownerId} AND j.climb_id = ${climbId} AND j.is_ascent = 1
    LIMIT 1
  `);
  return row?.id ?? undefined;
}

export async function getJournalEntry(db: Database, entryId: number, ownerId: string) {
  return db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.id, entryId), eq(journalEntries.userId, ownerId)))
    .get();
}

export type JournalCounts = {
  entries: number;
  sessions: number;
  training: number;
  days: number;
  entriesThisMonth: number;
  daysThisMonth: number;
  sentThisMonth: number;
};

const EMPTY_COUNTS: JournalCounts = {
  entries: 0,
  sessions: 0,
  training: 0,
  days: 0,
  entriesThisMonth: 0,
  daysThisMonth: 0,
  sentThisMonth: 0,
};

export async function getJournalCounts(
  db: Database,
  ownerId: string,
  viewerId: string | null,
  month: string,
): Promise<JournalCounts> {
  const monthPrefix = `${month}-%`;
  const row = await db.get<JournalCounts>(sql`
    SELECT
      COUNT(*)                                                        AS entries,
      COUNT(*) FILTER (WHERE j.kind = 'session')                      AS sessions,
      COUNT(*) FILTER (WHERE j.kind = 'training')                     AS training,
      COUNT(DISTINCT CASE WHEN j.kind = 'session' THEN j.entry_date END)
                                                                      AS days,
      COUNT(*) FILTER (WHERE j.entry_date LIKE ${monthPrefix})        AS entriesThisMonth,
      COUNT(DISTINCT CASE
        WHEN j.kind = 'session' AND j.entry_date LIKE ${monthPrefix} THEN j.entry_date
      END)
                                                                      AS daysThisMonth,
      COUNT(*) FILTER (WHERE j.sent = 1 AND j.entry_date LIKE ${monthPrefix})
                                                                      AS sentThisMonth
    FROM journal_entries j
    WHERE j.user_id = ${ownerId} AND ${journalVisibleSql(viewerId, sql`j.user_id`)}
  `);
  return row ?? EMPTY_COUNTS;
}

export type AnalyticsSessionRow = {
  entryDate: string;
  climbType: ClimbType | null;
  count: number;
};

export async function getJournalSessionsForAnalytics(
  db: Database,
  ownerId: string,
  viewerId: string | null,
): Promise<AnalyticsSessionRow[]> {
  return db.all<AnalyticsSessionRow>(sql`
    SELECT
      j.entry_date AS entryDate,
      climbs.type AS climbType,
      COUNT(*) AS count
    FROM journal_entries j
    JOIN climbs ON climbs.id = j.climb_id
    WHERE j.user_id = ${ownerId} AND ${journalVisibleSql(viewerId, sql`j.user_id`)} AND j.kind = 'session'
    GROUP BY j.entry_date, climbs.type
    ORDER BY j.entry_date, climbs.type
  `);
}

export type OpenProject = {
  climbId: number;
  climbName: string;
  climbType: ClimbType;
  climbGrade: number | null;
  areaId: number;
  areaName: string;
  sessionCount: number;
  firstSession: string;
  lastSession: string;
};

export const OPEN_PROJECT_PAGE_SIZE = 100;

export async function getOpenProjects(
  db: Database,
  ownerId: string,
  viewerId: string | null,
  limit: number = OPEN_PROJECT_PAGE_SIZE,
): Promise<OpenProject[]> {
  if (ownerId !== viewerId) return [];
  const boundedLimit = Number.isInteger(limit)
    ? Math.min(Math.max(limit, 1), OPEN_PROJECT_PAGE_SIZE + 1)
    : OPEN_PROJECT_PAGE_SIZE;

  return db.all<OpenProject>(sql`
    SELECT
      j.climb_id        AS climbId,
      climbs.name       AS climbName,
      climbs.type       AS climbType,
      climbs.grade      AS climbGrade,
      climbs.area_id    AS areaId,
      areas.name        AS areaName,
      COUNT(*)          AS sessionCount,
      MIN(j.entry_date) AS firstSession,
      MAX(j.entry_date) AS lastSession
    FROM journal_entries j
    JOIN climbs ON climbs.id = j.climb_id
    JOIN areas ON areas.id = climbs.area_id
    WHERE j.user_id = ${ownerId} AND ${journalVisibleSql(viewerId, sql`j.user_id`)} AND ${IS_OPEN_PROJECT}
    GROUP BY j.climb_id
    ORDER BY lastSession DESC, j.climb_id ASC
    LIMIT ${boundedLimit}
  `);
}
