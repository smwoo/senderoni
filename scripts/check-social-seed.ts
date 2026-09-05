import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { seedSocialData } from "./seed-social.ts";

const filename = process.argv[2];
if (!filename) throw new Error("Pass a disposable SQLite database path");
const db = new DatabaseSync(filename);
db.exec("PRAGMA foreign_keys = ON");
try {
  const viewer = db
    .prepare("SELECT id, is_private, journal_visibility FROM user WHERE email = 'dev@example.com'")
    .get() as { id: string; is_private: number; journal_visibility: string };
  assert.ok(viewer);
  const viewerProgress = db
    .prepare("SELECT * FROM user_product_tours WHERE user_id = ?")
    .all(viewer.id);
  seedSocialData(db, viewer.id);
  const tourProgress = () =>
    db
      .prepare(
        "SELECT u.email, t.version, t.status FROM user u LEFT JOIN user_product_tours t ON t.user_id = u.id AND t.tour_id = 'journal' WHERE u.email IN ('climber13@example.com', 'climber14@example.com', 'climber15@example.com', 'climber16@example.com') ORDER BY u.email",
      )
      .all()
      .map((row) => [row.email, row.version, row.status]);
  const expectedTours = [
    ["climber13@example.com", 1, "completed"],
    ["climber14@example.com", 1, "dismissed"],
    ["climber15@example.com", 2, "completed"],
    ["climber16@example.com", null, null],
  ];
  assert.deepEqual(tourProgress(), expectedTours);
  const query = `SELECT u.email, u.is_private AS private, u.journal_visibility AS journal, f.status,
    CASE WHEN f.status = 'accepted' THEN 'friends' WHEN f.requested_by = ? THEN 'outgoing' ELSE 'incoming' END AS relationship
    FROM friendships f JOIN user u ON u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END
    WHERE f.user_id = ? OR f.friend_id = ? ORDER BY CAST(substr(u.email, 8) AS INTEGER)`;
  const rows = db.prepare(query).all(viewer.id, viewer.id, viewer.id, viewer.id);
  assert.deepEqual(
    rows.map((r) => [r.email, r.private, r.journal, r.relationship]),
    [
      ["climber1@example.com", 0, "public", "friends"],
      ["climber2@example.com", 0, "public", "friends"],
      ["climber3@example.com", 0, "private", "friends"],
      ["climber4@example.com", 1, "public", "friends"],
      ["climber6@example.com", 0, "friends", "friends"],
      ["climber7@example.com", 0, "friends", "friends"],
      ["climber8@example.com", 0, "friends", "outgoing"],
      ["climber9@example.com", 1, "public", "incoming"],
      ["climber11@example.com", 0, "public", "incoming"],
      ["climber12@example.com", 0, "private", "friends"],
    ],
  );
  for (const row of rows.filter((r) => r.status === "accepted")) {
    const other = db.prepare("SELECT id FROM user WHERE email = ?").get(row.email);
    assert.ok(other);
    const reverse = db.prepare(query).all(other.id, other.id, other.id, other.id);
    assert.equal(
      reverse.filter((r) => r.email === "dev@example.com" && r.relationship === "friends").length,
      1,
    );
  }
  const empty = db.prepare("SELECT id FROM user WHERE email = 'climber5@example.com'").get();
  assert.ok(empty);
  assert.equal(
    db
      .prepare("SELECT count(*) AS n FROM friendships WHERE user_id = ? OR friend_id = ?")
      .get(empty.id, empty.id)?.n,
    0,
  );
  assert.deepEqual(
    db.prepare("SELECT id, is_private, journal_visibility FROM user WHERE id = ?").get(viewer.id),
    viewer,
  );
  const activities = db
    .prepare(
      "SELECT kind, sent, is_ascent, count(*) AS n FROM journal_entries WHERE tags LIKE '%social-demo%' GROUP BY kind, sent, is_ascent",
    )
    .all();
  assert.deepEqual(
    activities.map((r) => [r.kind, r.sent, r.is_ascent, r.n]),
    [
      ["session", 0, 0, 8],
      ["session", 1, 0, 8],
      ["session", 1, 1, 8],
      ["training", 0, 0, 8],
    ],
  );
  const count = db.prepare("SELECT count(*) AS n FROM journal_entries").get()?.n;
  seedSocialData(db, viewer.id);
  assert.deepEqual(tourProgress(), expectedTours);
  assert.deepEqual(
    db.prepare("SELECT * FROM user_product_tours WHERE user_id = ?").all(viewer.id),
    viewerProgress,
  );
  assert.deepEqual(db.prepare(query).all(viewer.id, viewer.id, viewer.id, viewer.id), rows);
  assert.equal(db.prepare("SELECT count(*) AS n FROM journal_entries").get()?.n, count);
  console.log(
    "Social seed passed: mutual friends, incoming/outgoing requests, all audiences, mixed days, empty feed, tour version upgrades and idempotency.",
  );
} finally {
  db.close();
}
