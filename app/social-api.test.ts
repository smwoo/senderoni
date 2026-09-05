import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import { GET as feed } from "@/app/api/feed/route";
import { GET as friends } from "@/app/api/friends/route";
import { GET as search } from "@/app/api/search/climbers/route";
import { createDb } from "@/db/client";
import {
  seedFixtureFriendship,
  seedFixtureUser,
  seedFixtureSend,
  seedFixtureTree,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const state = vi.hoisted(() => ({ viewer: "viewer" as string | null }));
vi.mock("@/lib/session", () => ({
  getSession: async () => (state.viewer ? { user: { id: state.viewer } } : null),
}));
vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
const db = createDb(env.DB);
beforeEach(async () => {
  state.viewer = "viewer";
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "viewer" });
  await seedFixtureUser(db, { id: "target", name: "Alex Public" });
  await seedFixtureUser(db, { id: "hidden", name: "Alex Hidden", isPrivate: true });
  await seedFixtureSend(db, { userId: "target", climbId: 1, dateSent: "2026-09-01" });
  await seedFixtureFriendship(db, "viewer", "target");
});
const request = (path: string) => new Request(`https://betabook.ca${path}`);

it("uses the authenticated viewer for feed and friends, with private response caching", async () => {
  const response = await feed(request("/api/feed?viewerId=hidden"));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const feedPage: { days: { userId: string }[] } = await response.json();
  expect(feedPage.days.map((d) => d.userId)).toEqual(["target"]);
  const list = await friends(request("/api/friends?userId=hidden"));
  const friendsPage: { friends: { id: string }[] } = await list.json();
  expect(friendsPage.friends.map((c) => c.id)).toEqual(["target"]);
});

it("returns only the signed-in user's incoming request count without loading identities", async () => {
  await seedFixtureFriendship(db, "hidden", "viewer", "pending");
  await seedFixtureUser(db, { id: "outgoing" });
  await seedFixtureFriendship(db, "viewer", "outgoing", "pending");
  const response = await friends(request("/api/friends?view=count&userId=hidden"));
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ userId: "viewer", count: 1 });
  state.viewer = "hidden";
  expect(await (await friends(request("/api/friends?view=count"))).json()).toEqual({
    userId: "hidden",
    count: 0,
  });
});

it("rejects expired sessions on private endpoints while public search stays available", async () => {
  state.viewer = null;
  expect((await feed(request("/api/feed"))).status).toBe(401);
  expect((await friends(request("/api/friends"))).status).toBe(401);
  expect((await friends(request("/api/friends?view=count"))).status).toBe(401);
  const response = await search(request("/api/search/climbers?name=Alex"));
  expect(await response.json()).toEqual({
    climbers: [
      {
        id: "target",
        name: "Alex Public",
        image: null,
        friendshipStatus: "none",
      },
    ],
    hasMore: false,
  });
});

it("rejects malformed and filter-mismatched cursors", async () => {
  for (const cursor of [
    "bad",
    "null",
    JSON.stringify({ version: 1, date: "2026-02-30", userId: "target", view: "all" }),
    JSON.stringify({ version: 1, date: "2026-09-01", userId: "target", view: "sends" }),
  ]) {
    expect((await feed(request(`/api/feed?cursor=${encodeURIComponent(cursor)}`))).status).toBe(
      400,
    );
  }
  const cursor = JSON.stringify({ version: 1, date: "2026-09-01", userId: "target", view: "all" });
  expect(
    await (await feed(request(`/api/feed?cursor=${encodeURIComponent(cursor)}`))).json(),
  ).toEqual({ days: [], hasMore: false });
});
