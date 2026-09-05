import { sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
/** Keep permission checks inside the read statement: revocation and audience
 * changes must affect notes, counts and pagination even with stale page props. */
export function journalVisibleSql(viewerId: string | null, authorId: SQL): SQL {
  return sql`EXISTS (
    SELECT 1 FROM user journal_owner
    WHERE journal_owner.id = ${authorId} AND (
      journal_owner.id = ${viewerId} OR (journal_owner.is_private = 0 AND (
        journal_owner.journal_visibility = 'public' OR (
          journal_owner.journal_visibility = 'friends' AND EXISTS (
            SELECT 1 FROM friendships WHERE user_id = min(journal_owner.id, ${viewerId})
              AND friend_id = max(journal_owner.id, ${viewerId}) AND status = 'accepted'
          )
        )
      ))
    )
  )`;
}

/** Uses the same current permission predicate as the data query and metadata. */
export async function canReadJournal(db: Database, ownerId: string, viewerId: string | null) {
  const row = await db.get<{ visible: number }>(
    sql`SELECT ${journalVisibleSql(viewerId, sql`${ownerId}`)} AS visible`,
  );
  return row?.visible === 1;
}
