import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { user } from "@/db/schema";
import { seedFixtureUser, seedFixtureFriendship } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import {
  getClimbersPage,
  getFriendship,
  getFriendsPage,
  getPendingFriendRequestCount,
} from "./friendships";

const db = createDb(env.DB);
beforeEach(async () => {
  await resetDb(db);
  for (const [id, name] of [
    ["viewer", "Alice Viewer"],
    ["alice", "Alice"],
    ["alex", "Alice Partner"],
    ["hidden", "Alice Hidden"],
    ["literal", "Al%pine"],
    ["outsider", "Outsider"],
  ])
    await seedFixtureUser(db, { id, name, isPrivate: id === "hidden" });
  await seedFixtureFriendship(db, "viewer", "alice");
  await seedFixtureFriendship(db, "hidden", "viewer", "pending");
  await seedFixtureFriendship(db, "viewer", "alex", "pending");
});

it("finds public names case-insensitively, exact first, with only the viewer's friendship state", async () => {
  expect(await getClimbersPage(db, "viewer", { name: "ALICE", pageSize: 1 })).toEqual({
    climbers: [{ id: "alice", name: "Alice", image: null, friendshipStatus: "friends" }],
    hasMore: true,
  });
  expect(await getClimbersPage(db, "viewer", { name: "ALICE", pageSize: 1, offset: 1 })).toEqual({
    climbers: [{ id: "alex", name: "Alice Partner", image: null, friendshipStatus: "outgoing" }],
    hasMore: false,
  });
  expect((await getClimbersPage(db, null, { name: "Al%" })).climbers).toEqual([
    { id: "literal", name: "Al%pine", image: null, friendshipStatus: "none" },
  ]);
  expect(await getClimbersPage(db, null)).toEqual({ climbers: [], hasMore: false });
  expect(
    (await getClimbersPage(db, "outsider", { name: "Alice" })).climbers.map(
      (row) => row.friendshipStatus,
    ),
  ).toEqual(["none", "none", "none"]);
});

it("shows an accepted connection from either direction and scopes private requester identities", async () => {
  expect(await getFriendship(db, "viewer", "alice")).toBe("friends");
  expect(await getFriendship(db, "alice", "viewer")).toBe("friends");
  expect(await getFriendship(db, null, "alice")).toBe("none");
  expect((await getFriendsPage(db, "viewer")).friends.map((row) => row.id)).toEqual(["alice"]);
  expect((await getFriendsPage(db, "alice")).friends.map((row) => row.id)).toEqual(["viewer"]);
  const requests = await getFriendsPage(db, "viewer", true);
  expect(
    requests.friends
      .map((row) => [row.id, row.friendshipStatus, row.isPrivate])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  ).toEqual([
    ["alex", "outgoing", false],
    ["hidden", "incoming", true],
  ]);
  expect(JSON.stringify(requests)).not.toContain("email");
  expect(await getPendingFriendRequestCount(db, "viewer")).toBe(1);
  expect(await getPendingFriendRequestCount(db, "alex")).toBe(1);
  expect(await getPendingFriendRequestCount(db, "hidden")).toBe(0);
  expect(await getFriendsPage(db, "outsider", true)).toEqual({ friends: [], hasMore: false });
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "alice"));
  expect(
    (await getClimbersPage(db, "viewer", { name: "Alice" })).climbers.map((row) => row.id),
  ).toEqual(["alex"]);
  expect((await getFriendsPage(db, "viewer")).friends).toEqual([
    { id: "alice", name: "Alice", image: null, isPrivate: true, friendshipStatus: "friends" },
  ]);
});

it("paginates accepted friends in both directions without including pending or unrelated pairs", async () => {
  for (let i = 0; i < 23; i += 1) {
    const id = `partner-${i}`;
    await seedFixtureUser(db, { id });
    await seedFixtureFriendship(db, i % 2 ? "viewer" : id, i % 2 ? id : "viewer");
  }
  await seedFixtureFriendship(db, "outsider", "hidden");
  const first = await getFriendsPage(db, "viewer");
  const next = await getFriendsPage(db, "viewer", false, 20);
  expect(first.friends).toHaveLength(20);
  expect(first.hasMore).toBe(true);
  expect(next.friends).toHaveLength(4);
  expect(next.hasMore).toBe(false);
  expect([...first.friends, ...next.friends].map((row) => row.id).sort()).toEqual(
    ["alice", ...Array.from({ length: 23 }, (_, i) => `partner-${i}`)].sort(),
  );
});
