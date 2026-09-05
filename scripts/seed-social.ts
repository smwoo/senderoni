import type { DatabaseSync } from "node:sqlite";

/** The caller owns the transaction. Reset synthetic friendships while preserving
 * the development account's journal, send history and privacy settings. */
export function seedSocialData(db: DatabaseSync, viewerId: string): number {
  const users = db
    .prepare(
      "SELECT id, email FROM user WHERE email GLOB 'climber[0-9]*@example.com' ORDER BY CAST(substr(email, 8) AS INTEGER)",
    )
    .all() as { id: string; email: string }[];
  const privacy = db.prepare("UPDATE user SET is_private = ?, journal_visibility = ? WHERE id = ?");
  const clear = db.prepare("DELETE FROM friendships WHERE user_id = ? OR friend_id = ?");
  const clearTour = db.prepare(
    "DELETE FROM user_product_tours WHERE user_id = ? AND tour_id = 'journal'",
  );
  const saveTour = db.prepare(
    "INSERT INTO user_product_tours (user_id, tour_id, version, status) VALUES (?, 'journal', ?, ?)",
  );
  const connect = db.prepare(
    "INSERT INTO friendships (user_id, friend_id, requested_by, status, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
  );
  const createdAt = new Date("2026-09-02T12:00:00Z").getTime();
  let total = 0;
  function add(requester: string, recipient: string, status: "pending" | "accepted") {
    if (requester === recipient) return;
    const [a, b] = requester < recipient ? [requester, recipient] : [recipient, requester];
    total += Number(connect.run(a, b, requester, status, createdAt).changes);
  }
  for (const [i, person] of users.entries()) {
    if (person.id === viewerId) continue;
    privacy.run(Number(i % 5 === 3), i % 5 === 2 ? "private" : "public", person.id);
    clear.run(person.id, person.id);
    clearTour.run(person.id);
    if (person.email === "climber13@example.com") saveTour.run(person.id, 1, "completed");
    if (person.email === "climber14@example.com") saveTour.run(person.id, 1, "dismissed");
    if (person.email === "climber15@example.com") saveTour.run(person.id, 2, "completed");
  }
  // Climber 5 has no relationships in either direction, even in larger seeds.
  const network = users.filter(
    (person) => person.email !== "climber5@example.com" && person.id !== viewerId,
  );
  for (const [i, person] of network.entries())
    for (let step = 1; step <= Math.min(3, network.length - 1); step += 1)
      add(person.id, network[(i + step) % network.length].id, "accepted");
  for (const [number, audience, relationship] of [
    [1, "public", "friends"],
    [2, "public", "friends"],
    [3, "private", "friends"],
    [4, "public", "friends"],
    [6, "friends", "friends"],
    [7, "friends", "friends"],
    [8, "friends", "outgoing"],
    [9, "public", "incoming"],
    [10, "friends", "none"],
    [11, "public", "incoming"],
    [12, "private", "friends"],
  ] as const) {
    const person = users.find((row) => row.email === `climber${number}@example.com`);
    if (!person || person.id === viewerId) continue;
    privacy.run(Number(number === 4 || number === 9), audience, person.id);
    if (relationship !== "none") {
      const incoming = relationship === "incoming" || number === 7 || number === 12;
      add(
        incoming ? person.id : viewerId,
        incoming ? viewerId : person.id,
        relationship === "friends" ? "accepted" : "pending",
      );
    }
    if ([1, 2, 3, 4, 6, 7, 8, 10].includes(number)) addDay(db, person.id);
  }
  return total;
}

function addDay(db: DatabaseSync, userId: string) {
  if (
    db
      .prepare(
        "SELECT 1 FROM journal_entries WHERE user_id = ? AND tags LIKE '%social-demo%' LIMIT 1",
      )
      .get(userId)
  )
    return;
  const climb = db
    .prepare(
      "SELECT c.id FROM climbs c WHERE NOT EXISTS (SELECT 1 FROM sends s WHERE s.user_id = ? AND s.climb_id = c.id) ORDER BY c.id LIMIT 1",
    )
    .get(userId) as { id: number } | undefined;
  // Tiny seeds may have no unsent climbs left; their ordinary history still
  // supplies the feed. Default-size seeds always get this mixed-activity day.
  if (!climb) return;
  const date = "2026-09-01";
  const note = "A good day out with friends. Finally found a steady sequence.";
  db.prepare(
    "INSERT INTO sends (user_id, climb_id, ascent_style, date_sent, comment) VALUES (?, ?, 'redpoint', ?, ?)",
  ).run(userId, climb.id, date, note);
  const entry = db.prepare(
    "INSERT INTO journal_entries (user_id, climb_id, kind, sent, is_ascent, entry_date, body, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const tags = JSON.stringify(["social-demo", "footwork"]);
  entry.run(userId, climb.id, "session", 1, 1, date, note, tags);
  entry.run(userId, climb.id, "session", 1, 0, date, "Repeated it with quieter feet.", tags);
  entry.run(userId, climb.id, "session", 0, 0, date, "Worked through the moves together.", tags);
  entry.run(
    userId,
    null,
    "training",
    0,
    0,
    date,
    "Easy mobility and a short hangboard session.",
    tags,
  );
}
