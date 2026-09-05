import { env } from "cloudflare:test";
import { expect, it } from "vitest";

import { createDb } from "@/db/client";
import { journalEntries } from "@/db/schema";
import { seedFixtureUser, seedFixtureFriendship } from "@/test/fixtures";
import { explainQueries } from "@/test/query-plans";
import { resetDb } from "@/test/reset-db";

import { getFeedPage } from "./feed";

it("bounds busy-day previews across many friends' histories using author indexes", async () => {
  const db = createDb(env.DB);
  await resetDb(db);
  await seedFixtureUser(db, { id: "viewer" });
  for (let author = 0; author < 25; author += 1) {
    const id = `author-${String(author).padStart(2, "0")}`;
    await seedFixtureUser(db, { id, journalVisibility: "public" });
    await seedFixtureFriendship(db, "viewer", id);
    for (let day = 1; day <= 30; day += 1) {
      await db.insert(journalEntries).values({
        userId: id,
        kind: "training",
        entryDate: `2026-08-${String(day).padStart(2, "0")}`,
        body: `Training ${author}/${day}`,
      });
    }
  }
  for (let batch = 0; batch < 50; batch += 1) {
    await db.insert(journalEntries).values(
      Array.from({ length: 6 }, () => ({
        userId: "author-24",
        kind: "training" as const,
        entryDate: "2026-09-01",
        body: "Long note ".repeat(200),
      })),
    );
  }
  const page = await getFeedPage(db, "viewer", "all", null, 2);
  expect(page.days.map((day) => [day.userId, day.date])).toEqual([
    ["author-24", "2026-09-01"],
    ["author-24", "2026-08-30"],
  ]);
  expect(page.days[0].training).toBe(300);
  expect(page.days[0].activities).toHaveLength(3);
  expect(page.days[0].activities[0].body).toBe(`${"Long note ".repeat(200).slice(0, 240)}…`);
  expect(page.hasMore).toBe(true);
  const next = await getFeedPage(
    db,
    "viewer",
    "all",
    { version: 1, view: "all", date: "2026-08-30", userId: "author-24" },
    2,
  );
  expect(next.days.map((day) => day.userId)).toEqual(["author-23", "author-22"]);
  const plans = await explainQueries(db, () => getFeedPage(db, "viewer"));
  const detail = plans
    .flat()
    .map((row) => row.detail)
    .join("\n");
  expect(detail).toMatch(/friendships/);
  expect(detail).toMatch(/journal_user_(date|climb)_idx/);
});
