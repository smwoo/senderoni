import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { friendships, user } from "@/db/schema";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/action-result";
import { seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import {
  requestFriendship,
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  removeFriendship,
} from "./friendships";

const state = vi.hoisted(() => ({ viewer: "alice" as string | null, allowed: true }));
const mail = vi.hoisted(() => ({
  apiKey: "test-key",
  baseUrl: "https://preview.betabook.ca/",
  send: vi.fn<
    (message: {
      from: string;
      to: string;
      subject: string;
      text?: string;
      html?: string;
    }) => Promise<{
      data: { id: string } | null;
      error: { message: string } | null;
    }>
  >(),
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({
    env: { RESEND_API_KEY: mail.apiKey, BETTER_AUTH_URL: mail.baseUrl },
  }),
}));
vi.mock("resend", () => ({
  Resend: class {
    public emails = { send: mail.send };
  },
}));
vi.mock("next/cache", () => ({
  refresh: vi.fn<() => void>(),
  revalidatePath: vi.fn<(path: string) => void>(),
}));
vi.mock("@/lib/session", async () => {
  const { NotSignedInError } = await import("@/lib/action-result");
  return {
    requireSession: async () => {
      if (!state.viewer) throw new NotSignedInError();
      return { user: { id: state.viewer } };
    },
  };
});
vi.mock("@/lib/rate-limit", () => ({ allowFriendshipWrite: async () => state.allowed }));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
const db = createDb(env.DB);
const rows = () => db.select().from(friendships);
beforeEach(async () => {
  vi.restoreAllMocks();
  mail.send.mockReset().mockResolvedValue({ data: { id: "email-1" }, error: null });
  mail.apiKey = "test-key";
  mail.baseUrl = "https://preview.betabook.ca/";
  await resetDb(db);
  state.viewer = "alice";
  state.allowed = true;
  for (const id of ["alice", "bob", "outsider", "hidden"])
    await seedFixtureUser(db, { id, isPrivate: id === "hidden" });
});

it("persists one pending pair for concurrent duplicate requests and preserves its initiator", async () => {
  expect(await Promise.all([requestFriendship("bob"), requestFriendship("bob")])).toEqual([
    { ok: true, value: "outgoing" },
    { ok: true, value: "outgoing" },
  ]);
  expect(await rows()).toEqual([
    {
      userId: "alice",
      friendId: "bob",
      requestedBy: "alice",
      status: "pending",
      createdAt: expect.any(Date),
    },
  ]);
  expect(mail.send).toHaveBeenCalledExactlyOnceWith({
    from: "Betabook <noreply@betabook.ca>",
    to: "bob@example.com",
    subject: "New friend request on Betabook",
    text: "Test Climber alice sent you a friend request on Betabook.\n\nAccept or decline the request:\nhttps://preview.betabook.ca/friends?view=requests",
  });
  const before = await rows();
  state.viewer = "bob";
  expect(await requestFriendship("alice")).toEqual({ ok: true, value: "incoming" });
  expect(await rows()).toEqual(before);
  expect(mail.send).toHaveBeenCalledTimes(1);
});

it.each(["alice", "bob"])(
  "emails the recipient when %s sends a request from a private profile",
  async (sender) => {
    const recipient = sender === "alice" ? "bob" : "alice";
    state.viewer = sender;
    const name = `Casey <script> & "O'Neil"`;
    await db
      .update(user)
      .set({ name, isPrivate: true, journalVisibility: "private" })
      .where(eq(user.id, sender));
    await db
      .update(user)
      .set({ email: "recipient-updated@example.com" })
      .where(eq(user.id, recipient));

    expect(await requestFriendship(recipient)).toEqual({ ok: true, value: "outgoing" });
    expect(await rows()).toEqual([
      expect.objectContaining({
        userId: "alice",
        friendId: "bob",
        requestedBy: sender,
        status: "pending",
      }),
    ]);
    expect(mail.send).toHaveBeenCalledExactlyOnceWith({
      from: "Betabook <noreply@betabook.ca>",
      to: "recipient-updated@example.com",
      subject: "New friend request on Betabook",
      text: `${name} sent you a friend request on Betabook.\n\nAccept or decline the request:\nhttps://preview.betabook.ca/friends?view=requests`,
    });
  },
);

it("does not email for existing friends, acceptance, or removal", async () => {
  await db.insert(friendships).values({ userId: "alice", friendId: "bob", requestedBy: "bob" });
  expect(await acceptFriendRequest("bob")).toEqual({ ok: true, value: "friends" });
  expect(await requestFriendship("bob")).toEqual({ ok: true, value: "friends" });
  state.viewer = "bob";
  expect(await requestFriendship("alice")).toEqual({ ok: true, value: "friends" });
  expect(await removeFriendship("alice")).toEqual({ ok: true, value: "none" });
  expect(await rows()).toEqual([]);
  expect(mail.send).not.toHaveBeenCalled();
});

it.each(["cancel", "decline"])("emails again for a fresh request after %s", async (operation) => {
  expect(await requestFriendship("bob")).toEqual({ ok: true, value: "outgoing" });
  expect(mail.send).toHaveBeenCalledTimes(1);
  if (operation === "cancel") {
    expect(await cancelFriendRequest("bob")).toEqual({ ok: true, value: "none" });
  } else {
    state.viewer = "bob";
    expect(await declineFriendRequest("alice")).toEqual({ ok: true, value: "none" });
    state.viewer = "alice";
  }
  expect(mail.send).toHaveBeenCalledTimes(1);
  expect(await rows()).toEqual([]);
  expect(await requestFriendship("bob")).toEqual({ ok: true, value: "outgoing" });
  expect(mail.send).toHaveBeenCalledTimes(2);
  expect(await rows()).toEqual([
    expect.objectContaining({ status: "pending", requestedBy: "alice" }),
  ]);
});

it.each(["rejected", "thrown"])(
  "keeps a saved request when email is %s and does not resend on duplicate clicks",
  async (failure) => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    if (failure === "rejected")
      mail.send.mockResolvedValue({ data: null, error: { message: "Provider unavailable" } });
    else mail.send.mockRejectedValue(new Error("Network unavailable"));
    expect(await requestFriendship("bob")).toEqual({ ok: true, value: "outgoing" });
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith("friend request email failed", expect.any(Error));
    const saved = await rows();
    expect(saved).toEqual([expect.objectContaining({ status: "pending", requestedBy: "alice" })]);
    expect(await requestFriendship("bob")).toEqual({ ok: true, value: "outgoing" });
    expect(await rows()).toEqual(saved);
    expect(mail.send).toHaveBeenCalledTimes(1);
  },
);

it("logs the email locally when Resend is not configured", async () => {
  mail.apiKey = "";
  mail.baseUrl = "http://localhost:3000";
  const logged = vi.spyOn(console, "log").mockImplementation(() => {});
  expect(await requestFriendship("bob")).toEqual({ ok: true, value: "outgoing" });
  expect(mail.send).not.toHaveBeenCalled();
  expect(logged).toHaveBeenCalledExactlyOnceWith(
    "[dev] friend request email for bob@example.com:\nTest Climber alice sent you a friend request on Betabook.\n\nAccept or decline the request:\nhttp://localhost:3000/friends?view=requests",
  );
  expect(await rows()).toEqual([
    expect.objectContaining({ status: "pending", requestedBy: "alice" }),
  ]);
});

it("only lets the recipient accept; one acceptance connects both people", async () => {
  await db.insert(friendships).values({ userId: "alice", friendId: "bob", requestedBy: "alice" });
  const before = await rows();
  expect((await acceptFriendRequest("bob")).ok).toBe(false);
  state.viewer = "outsider";
  expect((await acceptFriendRequest("alice")).ok).toBe(false);
  expect(await rows()).toEqual(before);
  state.viewer = "bob";
  expect(await acceptFriendRequest("alice")).toEqual({ ok: true, value: "friends" });
  expect(await rows()).toEqual([
    expect.objectContaining({
      userId: "alice",
      friendId: "bob",
      requestedBy: "alice",
      status: "accepted",
    }),
  ]);
  expect(await acceptFriendRequest("alice")).toEqual({ ok: true, value: "friends" });
});

it("scopes cancellation and decline, and prevents stale acceptance after either", async () => {
  await db.insert(friendships).values({ userId: "alice", friendId: "bob", requestedBy: "alice" });
  expect((await declineFriendRequest("bob")).ok).toBe(false);
  state.viewer = "bob";
  expect((await cancelFriendRequest("alice")).ok).toBe(false);
  expect(await rows()).toHaveLength(1);
  expect(await declineFriendRequest("alice")).toEqual({ ok: true, value: "none" });
  expect(await rows()).toEqual([]);
  expect((await acceptFriendRequest("alice")).ok).toBe(false);
  state.viewer = "alice";
  await requestFriendship("bob");
  expect(await cancelFriendRequest("bob")).toEqual({ ok: true, value: "none" });
  state.viewer = "bob";
  expect((await acceptFriendRequest("alice")).ok).toBe(false);
  expect(await rows()).toEqual([]);
});

it.each(["alice", "bob"])(
  "lets %s end the whole connection, including with a now-private partner",
  async (viewer) => {
    await db.insert(friendships).values([
      { userId: "alice", friendId: "bob", requestedBy: "alice", status: "accepted" },
      { userId: "bob", friendId: "outsider", requestedBy: "outsider", status: "accepted" },
    ]);
    await db.update(user).set({ isPrivate: true }).where(eq(user.id, "bob"));
    state.viewer = viewer;
    expect(await removeFriendship(viewer === "alice" ? "bob" : "alice")).toEqual({
      ok: true,
      value: "none",
    });
    expect(await rows()).toEqual([
      expect.objectContaining({ userId: "bob", friendId: "outsider", status: "accepted" }),
    ]);
  },
);

it("requires fresh acceptance after removal and cannot remove an incoming request as a friend", async () => {
  await db.insert(friendships).values({ userId: "alice", friendId: "bob", requestedBy: "bob" });
  expect((await removeFriendship("bob")).ok).toBe(false);
  expect(await rows()).toHaveLength(1);
  await acceptFriendRequest("bob");
  await removeFriendship("bob");
  expect(await requestFriendship("bob")).toEqual({ ok: true, value: "outgoing" });
  expect(await rows()).toEqual([
    expect.objectContaining({ status: "pending", requestedBy: "alice" }),
  ]);
});

it("requires authentication on every mutation without changing state", async () => {
  await db.insert(friendships).values({ userId: "alice", friendId: "bob", requestedBy: "alice" });
  const before = await rows();
  state.viewer = null;
  for (const action of [
    requestFriendship,
    acceptFriendRequest,
    cancelFriendRequest,
    declineFriendRequest,
    removeFriendship,
  ])
    expect(await action("bob")).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
  expect(await rows()).toEqual(before);
  expect(mail.send).not.toHaveBeenCalled();
});

it("rejects self, invalid, private and missing targets and rate-limited creation without writes", async () => {
  for (const target of ["alice", "", " ", "x".repeat(129), "hidden", "missing"])
    expect((await requestFriendship(target)).ok).toBe(false);
  expect(await requestFriendship("hidden")).toEqual(await requestFriendship("missing"));
  state.allowed = false;
  expect((await requestFriendship("bob")).ok).toBe(false);
  expect(await rows()).toEqual([]);
  expect(mail.send).not.toHaveBeenCalled();
});

it("enforces a unique unordered pair, participant requester, valid state and account cascades", async () => {
  await db.insert(friendships).values({ userId: "alice", friendId: "bob", requestedBy: "alice" });
  for (const row of [
    { userId: "alice", friendId: "bob", requestedBy: "bob" },
    { userId: "bob", friendId: "alice", requestedBy: "bob" },
    { userId: "alice", friendId: "alice", requestedBy: "alice" },
    { userId: "alice", friendId: "outsider", requestedBy: "bob" },
  ])
    await expect(db.insert(friendships).values(row)).rejects.toThrow(/UNIQUE|CHECK|Failed query/i);
  await db.delete(user).where(eq(user.id, "bob"));
  expect(await rows()).toEqual([]);
});
