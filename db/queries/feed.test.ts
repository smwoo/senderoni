import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { friendships, journalEntries, sends, user } from "@/db/schema";
import { DEFAULT_JOURNAL_FILTER } from "@/lib/journal-filter";
import { DEFAULT_USER_SENDS_FILTER } from "@/lib/user-sends-filter";
import {
  seedFixtureJournalEntry,
  seedFixtureFriendship,
  seedFixtureSend,
  seedFixtureTree,
  seedFixtureUser,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { getFeedPage } from "./feed";
import { getJournalPage } from "./journal";
import { getSendsForUserPage } from "./sends";

const db = createDb(env.DB);
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  for (const id of ["viewer", "public", "quiet", "private", "stranger"]) {
    await seedFixtureUser(db, {
      id,
      isPrivate: id === "private",
      journalVisibility: id === "quiet" ? "private" : "public",
    });
  }
  for (const friend of ["public", "quiet", "private"])
    await seedFixtureFriendship(db, "viewer", friend);
  for (const userId of ["public", "quiet", "private", "stranger", "viewer"]) {
    await seedFixtureSend(db, {
      userId,
      climbId: 1,
      dateSent: "2026-09-01",
      comment: `${userId} send note`,
    });
    await seedFixtureJournalEntry(db, {
      userId,
      climbId: 1,
      entryDate: "2026-09-01",
      sent: true,
      isAscent: true,
      body: `${userId} send note`,
    });
    await seedFixtureJournalEntry(db, {
      userId,
      kind: "training",
      entryDate: "2026-09-01",
      body: `${userId} training note`,
    });
  }
  await seedFixtureJournalEntry(db, {
    userId: "public",
    climbId: 1,
    entryDate: "2026-09-01",
    sent: true,
    body: "Repeat note",
  });
  await seedFixtureJournalEntry(db, {
    userId: "public",
    climbId: 2,
    entryDate: "2026-09-01",
    body: "Session note",
  });
  await seedFixtureSend(db, { userId: "public", climbId: 2, dateSent: null, comment: "Undated" });
});

it("returns connected public climber/day groups, deduplicates ascents, and bounds previews", async () => {
  const page = await getFeedPage(db, "viewer");
  expect(page.days.map((d) => d.userId)).toEqual(["quiet", "public"]);
  expect(page.days[0]).toMatchObject({
    journalVisible: false,
    sends: 1,
    repeats: 0,
    sessions: 0,
    training: 0,
    activities: [{ kind: "send", body: null }],
  });
  expect(page.days[1]).toMatchObject({
    journalVisible: true,
    sends: 1,
    repeats: 1,
    sessions: 1,
    training: 1,
  });
  expect(page.days[1].activities).toHaveLength(3);
  expect(page.days[1].activities[0]).toMatchObject({
    kind: "send",
    climbId: 1,
    climbName: "Test Highball",
    areaName: "Test Highball Alcove",
  });
  expect(JSON.stringify(page)).not.toContain("quiet training note");
  expect(JSON.stringify(page)).not.toContain("Undated");
});

it("pages whole days across tied dates without missing or duplicating climbers", async () => {
  const first = await getFeedPage(db, "viewer", "all", null, 1);
  expect(first.days.map((d) => d.userId)).toEqual(["quiet"]);
  expect(first.hasMore).toBe(true);
  const second = await getFeedPage(
    db,
    "viewer",
    "all",
    { version: 1, date: first.days[0].date, userId: first.days[0].userId, view: "all" },
    1,
  );
  expect(second.days.map((d) => d.userId)).toEqual(["public"]);
  expect(second.days[0].training).toBe(1);
  expect(second.hasMore).toBe(false);
});

it("filters sends before calculating group counts and supports training-only days", async () => {
  await seedFixtureJournalEntry(db, {
    userId: "public",
    kind: "training",
    entryDate: "2026-09-02",
    body: "Hangboard",
  });
  const all = await getFeedPage(db, "viewer");
  expect(all.days[0]).toMatchObject({
    date: "2026-09-02",
    sends: 0,
    training: 1,
    activities: [{ kind: "training", body: "Hangboard", climbId: null }],
  });
  const filtered = await getFeedPage(db, "viewer", "sends");
  expect(filtered.days.map((d) => [d.userId, d.date, d.sends, d.training])).toEqual([
    ["quiet", "2026-09-01", 1, 0],
    ["public", "2026-09-01", 1, 0],
  ]);
});

it("honors journal and profile privacy changes and friend removal on subsequent reads", async () => {
  expect((await getFeedPage(db, "viewer")).days).toHaveLength(2);
  await db.update(user).set({ journalVisibility: "private" }).where(eq(user.id, "public"));
  expect((await getFeedPage(db, "viewer")).days[1]).toMatchObject({
    sends: 1,
    training: 0,
    repeats: 0,
    sessions: 0,
  });
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "quiet"));
  expect((await getFeedPage(db, "viewer")).days.map((d) => d.userId)).toEqual(["public"]);
  await db.delete(friendships).where(eq(friendships.userId, "public"));
  expect(await getFeedPage(db, "viewer")).toEqual({ days: [], hasMore: false });
});

it("sorts historical imports by climbing date and reflects deleted sends becoming sessions", async () => {
  await seedFixtureSend(db, { userId: "public", climbId: 3, dateSent: "2020-01-01" });
  expect((await getFeedPage(db, "viewer")).days.map((d) => d.date)).toEqual([
    "2026-09-01",
    "2026-09-01",
    "2020-01-01",
  ]);
  await db.delete(sends).where(eq(sends.userId, "public"));
  const page = await getFeedPage(db, "viewer");
  expect(page.days.map((d) => d.date)).toEqual(["2026-09-01", "2026-09-01"]);
  expect(page.days[1]).toMatchObject({ sends: 0, repeats: 0, sessions: 3, training: 1 });
  await db.delete(journalEntries).where(eq(journalEntries.userId, "public"));
  expect((await getFeedPage(db, "viewer")).days.map((d) => d.userId)).toEqual(["quiet"]);
});

it("filters journal and sends detail views to the selected day", async () => {
  await seedFixtureJournalEntry(db, {
    userId: "public",
    kind: "training",
    entryDate: "2026-09-02",
    body: "Next day",
  });
  const journal = await getJournalPage(db, "public", "viewer", {
    ...DEFAULT_JOURNAL_FILTER,
    date: "2026-09-02",
  });
  expect(journal.entries.map((e) => e.body)).toEqual(["Next day"]);
  await seedFixtureSend(db, { userId: "public", climbId: 3, dateSent: "2026-09-02" });
  const page = await getSendsForUserPage(
    db,
    "public",
    { ...DEFAULT_USER_SENDS_FILTER, date: "2026-09-02" },
    0,
  );
  expect(page.sends.map((s) => s.climbId)).toEqual([3]);
});
