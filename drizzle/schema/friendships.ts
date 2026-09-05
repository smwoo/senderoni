import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

export const friendships = sqliteTable(
  "friendships",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    friendId: text("friend_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "accepted"] })
      .notNull()
      .default("pending"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.friendId] }),
    index("friendships_friend_idx").on(t.friendId),
    check("friendships_ordered_pair", sql`${t.userId} < ${t.friendId}`),
    check("friendships_requester_is_member", sql`${t.requestedBy} IN (${t.userId}, ${t.friendId})`),
    check("friendships_valid_status", sql`${t.status} IN ('pending', 'accepted')`),
  ],
);
