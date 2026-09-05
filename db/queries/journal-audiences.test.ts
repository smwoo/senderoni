import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { friendships, user } from "@/db/schema";
import type { JournalVisibility } from "@/lib/journal";
import { DEFAULT_JOURNAL_FILTER } from "@/lib/journal-filter";
import { DEFAULT_USER_SENDS_FILTER } from "@/lib/user-sends-filter";
import {
  seedFixtureUser,
  seedFixtureFriendship,
  seedFixtureTree,
  seedFixtureSend,
  seedFixtureJournalEntry,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { getFeedPage } from "./feed";
import {
  getJournalPage,
  getJournalForClimb,
  getJournalCounts,
  getJournalSessionsForAnalytics,
  getOpenProjects,
} from "./journal";
import { canReadJournal } from "./journal-access";
import { getSendsForClimb, getSendsForUserPage } from "./sends";

const db = createDb(env.DB);
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  for (const id of ["author", "outgoing", "incoming", "connected", "stranger"])
    await seedFixtureUser(db, { id });
  await seedFixtureFriendship(db, "outgoing", "author", "pending");
  await seedFixtureFriendship(db, "author", "incoming", "pending");
  await seedFixtureFriendship(db, "connected", "author");
  await seedFixtureSend(db, {
    userId: "author",
    climbId: 1,
    dateSent: "2026-09-01",
    comment: "Restricted ascent note",
  });
  await seedFixtureJournalEntry(db, {
    userId: "author",
    climbId: 1,
    entryDate: "2026-09-01",
    sent: true,
    isAscent: true,
    body: "Restricted ascent note",
  });
  await seedFixtureJournalEntry(db, {
    userId: "author",
    climbId: 2,
    entryDate: "2026-09-01",
    body: "Restricted project session",
    tags: ["secret-tag"],
  });
  await seedFixtureJournalEntry(db, {
    userId: "author",
    kind: "training",
    entryDate: "2026-09-01",
    body: "Restricted training",
  });
});

it.each<JournalVisibility>(["private", "public", "friends"])(
  "enforces the %s audience across notes, journal data and feed",
  // oxlint-disable-next-line complexity -- one explicit audience matrix covers every read surface
  async (journalVisibility) => {
    await db.update(user).set({ journalVisibility }).where(eq(user.id, "author"));
    const ownerId = "author";
    for (const viewer of ["connected", "outgoing", "incoming", "stranger", null, "author"]) {
      const isFriend = viewer === "connected";
      const canRead =
        viewer === "author" ||
        journalVisibility === "public" ||
        (journalVisibility === "friends" && isFriend);
      expect(await canReadJournal(db, ownerId, viewer)).toBe(canRead);
      const page = await getJournalPage(db, ownerId, viewer, DEFAULT_JOURNAL_FILTER);
      expect(page.entries.map((entry) => entry.body)).toEqual(
        canRead
          ? ["Restricted training", "Restricted project session", "Restricted ascent note"]
          : [],
      );
      expect((await getJournalForClimb(db, ownerId, viewer, 2)).map((entry) => entry.body)).toEqual(
        canRead ? ["Restricted project session"] : [],
      );
      expect((await getJournalCounts(db, ownerId, viewer, "2026-09")).entries).toBe(
        canRead ? 3 : 0,
      );
      expect(await getJournalSessionsForAnalytics(db, ownerId, viewer)).toEqual(
        canRead ? [{ entryDate: "2026-09-01", climbType: "boulder", count: 2 }] : [],
      );
      expect(
        (await getOpenProjects(db, ownerId, viewer)).map((project) => project.climbId),
      ).toEqual(viewer === "author" ? [2] : []);
      const climbSends = await getSendsForClimb(db, 1, 0, 10, viewer);
      expect(climbSends.sends).toHaveLength(1);
      expect(climbSends.sends[0].comment).toBe(canRead ? "Restricted ascent note" : null);
      const userSends = await getSendsForUserPage(
        db,
        "author",
        DEFAULT_USER_SENDS_FILTER,
        0,
        20,
        viewer,
      );
      expect(userSends.sends).toHaveLength(1);
      expect(userSends.sends[0].comment).toBe(canRead ? "Restricted ascent note" : null);
      if (viewer && viewer !== "author") {
        const feed = await getFeedPage(db, viewer);
        expect(feed.days.map((day) => day.userId)).toEqual(isFriend ? ["author"] : []);
        if (isFriend) {
          expect(feed.days[0]).toMatchObject({
            sends: 1,
            sessions: canRead ? 1 : 0,
            training: canRead ? 1 : 0,
          });
          expect(feed.days[0].activities[0].body).toBe(canRead ? "Restricted ascent note" : null);
        }
      }
    }
  },
);

it("checks current DB privacy and friendships after audience changes and removal", async () => {
  const ownerId = "author";
  await db.update(user).set({ journalVisibility: "friends" }).where(eq(user.id, "author"));
  expect((await getJournalPage(db, ownerId, "outgoing", DEFAULT_JOURNAL_FILTER)).entries).toEqual(
    [],
  );
  expect(
    (await getJournalPage(db, ownerId, "connected", DEFAULT_JOURNAL_FILTER)).entries,
  ).toHaveLength(3);
  await db.delete(friendships).where(eq(friendships.requestedBy, "connected"));
  expect((await getJournalPage(db, ownerId, "connected", DEFAULT_JOURNAL_FILTER)).entries).toEqual(
    [],
  );
  expect((await getFeedPage(db, "connected")).days).toEqual([]);
  await seedFixtureFriendship(db, "connected", "author");
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "author"));
  expect((await getJournalPage(db, ownerId, "connected", DEFAULT_JOURNAL_FILTER)).entries).toEqual(
    [],
  );
  expect((await getJournalCounts(db, ownerId, "connected", "2026-09")).entries).toBe(0);
  expect((await getFeedPage(db, "connected")).days).toEqual([]);
  expect(
    (await getJournalPage(db, ownerId, "author", DEFAULT_JOURNAL_FILTER)).entries,
  ).toHaveLength(3);
});

it("shares journal activity in both directions and ends both feeds and journal access on removal", async () => {
  await db.update(user).set({ journalVisibility: "friends" });
  await seedFixtureJournalEntry(db, {
    userId: "connected",
    kind: "training",
    entryDate: "2026-09-02",
    body: "Partner training",
  });
  const authorId = "author";
  const partnerId = "connected";
  expect(
    (await getJournalPage(db, partnerId, "author", DEFAULT_JOURNAL_FILTER)).entries.map(
      (row) => row.body,
    ),
  ).toEqual(["Partner training"]);
  expect(
    (await getJournalPage(db, authorId, "connected", DEFAULT_JOURNAL_FILTER)).entries,
  ).toHaveLength(3);
  expect((await getFeedPage(db, "author")).days.map((day) => day.userId)).toEqual(["connected"]);
  expect((await getFeedPage(db, "connected")).days.map((day) => day.userId)).toEqual(["author"]);
  await db.delete(friendships).where(eq(friendships.requestedBy, "connected"));
  for (const [ownerId, viewer] of [
    [authorId, "connected"],
    [partnerId, "author"],
  ] as const) {
    expect((await getJournalPage(db, ownerId, viewer, DEFAULT_JOURNAL_FILTER)).entries).toEqual([]);
    expect((await getFeedPage(db, viewer)).days).toEqual([]);
  }
});
