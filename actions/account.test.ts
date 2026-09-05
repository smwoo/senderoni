import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setJournalVisibility, setUserPrivate } from "@/actions";
import { createDb } from "@/db/client";
import { user } from "@/db/schema";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/action-result";
import { seedFixtureUser } from "@/test/fixtures";

const sessionState = vi.hoisted(() => ({ userId: "test-user" as string | null }));

vi.mock("next/cache", () => ({
  refresh: () => {},
  revalidatePath: () => {},
}));

vi.mock("@/lib/session", async () => {
  const { NotSignedInError } = await import("@/lib/action-result");
  return {
    getSession: async () => (sessionState.userId ? { user: { id: sessionState.userId } } : null),
    requireSession: async () => {
      if (!sessionState.userId) throw new NotSignedInError();
      return { user: { id: sessionState.userId } };
    },
  };
});

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return {
    ...actual,
    getDb: async () => actual.createDb(env.DB),
  };
});

const db = createDb(env.DB);

beforeEach(async () => {
  sessionState.userId = "test-user";
  await db.delete(user);
  await seedFixtureUser(db, { id: "test-user", isPrivate: false, journalVisibility: "private" });
  await seedFixtureUser(db, { id: "other-user", isPrivate: false, journalVisibility: "private" });
});

async function privacy() {
  return db
    .select({ id: user.id, isPrivate: user.isPrivate, journalVisibility: user.journalVisibility })
    .from(user)
    .orderBy(user.id);
}

describe("setUserPrivate action boundary", () => {
  it("returns ok:false with the friendly session message when signed out", async () => {
    const before = await privacy();
    sessionState.userId = null;
    const otherBefore = await db.select().from(user).where(eq(user.id, "other-user")).get();
    const result = await setUserPrivate(true);
    expect(await db.select().from(user).where(eq(user.id, "other-user")).get()).toEqual(
      otherBefore,
    );
    expect(result).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
    expect(await privacy()).toEqual(before);
  });

  it("flips the signed-in user's isPrivate flag on", async () => {
    const otherBefore = await db.select().from(user).where(eq(user.id, "other-user")).get();
    const result = await setUserPrivate(true);
    expect(await db.select().from(user).where(eq(user.id, "other-user")).get()).toEqual(
      otherBefore,
    );
    expect(result).toEqual({ ok: true, value: undefined });

    const row = await db.select().from(user).where(eq(user.id, "test-user")).get();
    expect(row?.isPrivate).toBe(true);
  });

  it("flips the signed-in user's isPrivate flag back off", async () => {
    await db.update(user).set({ isPrivate: true });
    const otherBefore = await db.select().from(user).where(eq(user.id, "other-user")).get();
    const result = await setUserPrivate(false);
    expect(await db.select().from(user).where(eq(user.id, "other-user")).get()).toEqual(
      otherBefore,
    );
    expect(result).toEqual({ ok: true, value: undefined });

    const row = await db.select().from(user).where(eq(user.id, "test-user")).get();
    expect(row?.isPrivate).toBe(false);
  });
});

describe("setJournalVisibility action boundary", () => {
  it("requires a signed-in user", async () => {
    const before = await privacy();
    sessionState.userId = null;
    const otherBefore = await db.select().from(user).where(eq(user.id, "other-user")).get();
    const result = await setJournalVisibility("public");
    expect(await db.select().from(user).where(eq(user.id, "other-user")).get()).toEqual(
      otherBefore,
    );
    expect(result).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
    expect(await privacy()).toEqual(before);
  });

  it("publishes the signed-in user's journal", async () => {
    const otherBefore = await db.select().from(user).where(eq(user.id, "other-user")).get();
    const result = await setJournalVisibility("public");
    expect(await db.select().from(user).where(eq(user.id, "other-user")).get()).toEqual(
      otherBefore,
    );
    expect(result).toEqual({ ok: true, value: undefined });

    const row = await db.select().from(user).where(eq(user.id, "test-user")).get();
    expect(row?.journalVisibility).toBe("public");
  });

  it("makes the signed-in user's journal private again", async () => {
    await db.update(user).set({ journalVisibility: "public" });
    const otherBefore = await db.select().from(user).where(eq(user.id, "other-user")).get();
    const result = await setJournalVisibility("private");
    expect(await db.select().from(user).where(eq(user.id, "other-user")).get()).toEqual(
      otherBefore,
    );
    expect(result).toEqual({ ok: true, value: undefined });

    const row = await db.select().from(user).where(eq(user.id, "test-user")).get();
    expect(row?.journalVisibility).toBe("private");
  });

  it("rejects an invalid visibility", async () => {
    const otherBefore = await db.select().from(user).where(eq(user.id, "other-user")).get();
    const before = await privacy();
    const result = await setJournalVisibility("invalid");
    expect(await db.select().from(user).where(eq(user.id, "other-user")).get()).toEqual(
      otherBefore,
    );
    expect(result).toEqual({ ok: false, error: "Invalid journal visibility" });
    expect(await privacy()).toEqual(before);
  });
});

it("saves Friends sharing without accepting a pending request or changing the other account", async () => {
  const { friendships } = await import("@/db/schema");
  await db
    .insert(friendships)
    .values({ userId: "other-user", friendId: "test-user", requestedBy: "other-user" });
  const before = await db.select().from(friendships);
  const otherBefore = await db.select().from(user).where(eq(user.id, "other-user")).get();
  expect(await setJournalVisibility("friends")).toEqual({ ok: true, value: undefined });
  expect(
    (await db.select().from(user).where(eq(user.id, "test-user")).get())?.journalVisibility,
  ).toBe("friends");
  expect(await db.select().from(friendships)).toEqual(before);
  expect(await db.select().from(user).where(eq(user.id, "other-user")).get()).toEqual(otherBefore);
});
