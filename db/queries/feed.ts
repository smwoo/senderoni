import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import type { FeedCursor, FeedView } from "@/lib/feed";
import type { ClimbType } from "@/lib/grades";
import type { AscentStyle } from "@/lib/sends";

import { journalVisibleSql } from "./journal-access";

type FeedActivity = {
  id: number;
  kind: "send" | "repeat" | "session" | "training";
  climbId: number | null;
  climbName: string | null;
  climbType: ClimbType | null;
  climbGrade: number | null;
  areaId: number | null;
  areaName: string | null;
  ascentStyle: AscentStyle | null;
  body: string | null;
};
export type FeedDay = {
  userId: string;
  name: string;
  image: string | null;
  date: string;
  journalVisible: boolean;
  sends: number;
  repeats: number;
  sessions: number;
  training: number;
  activities: FeedActivity[];
};
export type FeedPage = { days: FeedDay[]; hasMore: boolean };

export async function getFeedPage(
  db: Database,
  viewerId: string,
  view: FeedView = "all",
  cursor: FeedCursor | null = null,
  pageSize = 20,
): Promise<FeedPage> {
  const limit = Number.isInteger(pageSize) ? Math.min(50, Math.max(1, pageSize)) : 20;
  type Row = Omit<FeedDay, "activities" | "journalVisible"> &
    FeedActivity & { journalVisible: number };
  // One statement keeps eligibility, counts and previews on the same database
  // snapshot. Only connected authors are scanned; full notes never cross JSON.
  const rows = await db.all<Row>(sql`
    WITH friends AS (
      SELECT friend_id AS id FROM friendships WHERE user_id = ${viewerId} AND status = 'accepted'
      UNION ALL
      SELECT user_id AS id FROM friendships WHERE friend_id = ${viewerId} AND status = 'accepted'
    ), authors AS (
      SELECT u.id, u.name, u.image, ${journalVisibleSql(viewerId, sql`u.id`)} AS journalVisible
      FROM friends f JOIN user u ON u.id = f.id
      WHERE u.is_private = 0
    ), activity AS (
      SELECT s.user_id AS userId, s.date_sent AS date, s.id, 'send' AS kind,
        s.climb_id AS climbId, s.ascent_style AS ascentStyle, CASE WHEN u.journalVisible THEN s.comment ELSE NULL END AS body
      FROM authors u JOIN sends s ON s.user_id = u.id
      WHERE s.date_sent IS NOT NULL
        ${cursor ? sql`AND (s.date_sent, s.user_id) < (${cursor.date}, ${cursor.userId})` : sql``}
      UNION ALL
      SELECT j.user_id, j.entry_date, j.id,
        CASE WHEN j.kind = 'training' THEN 'training' WHEN j.sent = 1 THEN 'repeat' ELSE 'session' END,
        j.climb_id, NULL, j.body
      FROM authors u JOIN journal_entries j ON j.user_id = u.id
      WHERE ${view === "all"} AND u.journalVisible AND j.is_ascent = 0
        ${cursor ? sql`AND (j.entry_date, j.user_id) < (${cursor.date}, ${cursor.userId})` : sql``}
    ), days AS (
      SELECT userId, date,
        count(*) FILTER (WHERE kind = 'send') AS sends,
        count(*) FILTER (WHERE kind = 'repeat') AS repeats,
        count(*) FILTER (WHERE kind = 'session') AS sessions,
        count(*) FILTER (WHERE kind = 'training') AS training
      FROM activity GROUP BY date, userId
      ORDER BY date DESC, userId DESC LIMIT ${limit + 1}
    ), previews AS (
      SELECT a.*, row_number() OVER (
        PARTITION BY a.date, a.userId ORDER BY
          CASE a.kind WHEN 'send' THEN 0 WHEN 'repeat' THEN 1 WHEN 'session' THEN 2 ELSE 3 END, a.id
      ) AS position
      FROM activity a JOIN days d ON d.date = a.date AND d.userId = a.userId
    )
    SELECT d.*, u.name, u.image, u.journalVisible AS journalVisible,
      p.id, p.kind, p.climbId, p.ascentStyle,
      CASE WHEN length(p.body) > 240 THEN substr(p.body, 1, 240) || '…' ELSE p.body END AS body,
      c.name AS climbName, c.type AS climbType, c.grade AS climbGrade,
      a.id AS areaId, a.name AS areaName
    FROM days d JOIN authors u ON u.id = d.userId
    JOIN previews p ON p.date = d.date AND p.userId = d.userId AND p.position <= 3
    LEFT JOIN climbs c ON c.id = p.climbId LEFT JOIN areas a ON a.id = c.area_id
    ORDER BY d.date DESC, d.userId DESC, p.position
  `);
  const groups = new Map<string, FeedDay>();
  for (const row of rows) {
    const {
      userId,
      name,
      image,
      date,
      journalVisible,
      sends,
      repeats,
      sessions,
      training,
      ...activity
    } = row;
    const key = JSON.stringify([date, userId]);
    let day = groups.get(key);
    if (!day) {
      day = {
        userId,
        name,
        image,
        date,
        journalVisible: journalVisible === 1,
        sends,
        repeats,
        sessions,
        training,
        activities: [],
      };
      groups.set(key, day);
    }
    day.activities.push(activity);
  }
  return { days: [...groups.values()].slice(0, limit), hasMore: groups.size > limit };
}
