import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { saveProductTourStatus } from "@/actions";
import { createDb } from "@/db/client";
import { getProductTourState } from "@/db/queries";
import { user, userProductTours } from "@/db/schema";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/action-result";
import { PRODUCT_TOURS } from "@/lib/product-tour";
import { seedFixtureUser } from "@/test/fixtures";

const sessionState = vi.hoisted(() => ({ userId: "tour-owner" as string | null }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/session", async () => {
  const { NotSignedInError } = await import("@/lib/action-result");
  return {
    requireSession: async () => {
      if (!sessionState.userId) throw new NotSignedInError();
      return { user: { id: sessionState.userId } };
    },
  };
});
vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
const db = createDb(env.DB);
const tour = PRODUCT_TOURS[0];

beforeAll(async () => {
  await seedFixtureUser(db, { id: "tour-owner" });
  await seedFixtureUser(db, { id: "tour-other" });
});
beforeEach(async () => {
  sessionState.userId = "tour-owner";
  await db.delete(userProductTours);
});

describe("product tour progress", () => {
  it.each(["completed", "dismissed"] as const)(
    "acknowledges version 2 after version 1 was %s and rejects stale version 1 writes",
    async (status) => {
      await db.insert(userProductTours).values({
        userId: "tour-owner",
        tourId: tour.id,
        version: 1,
        status,
      });
      expect(await saveProductTourStatus(tour.id, 2, "dismissed")).toEqual({
        ok: true,
        value: undefined,
      });
      expect((await getProductTourState(db, "tour-owner"))?.progress).toEqual([
        { tourId: tour.id, version: 2, status: "dismissed" },
      ]);
      expect((await saveProductTourStatus(tour.id, 1, "completed")).ok).toBe(false);
      expect((await getProductTourState(db, "tour-owner"))?.progress).toEqual([
        { tourId: tour.id, version: 2, status: "dismissed" },
      ]);
      expect(await saveProductTourStatus(tour.id, 2, "completed")).toEqual({
        ok: true,
        value: undefined,
      });
      expect((await getProductTourState(db, "tour-owner"))?.progress).toEqual([
        { tourId: tour.id, version: 2, status: "completed" },
      ]);
    },
  );

  it("requires authentication", async () => {
    sessionState.userId = null;
    expect(await saveProductTourStatus(tour.id, tour.version, "completed")).toEqual({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE,
    });
    expect(await db.select().from(userProductTours)).toHaveLength(0);
  });
  it("stores only the authenticated user's progress and preserves other tours", async () => {
    await db
      .insert(userProductTours)
      .values({ userId: "tour-owner", tourId: "another-feature", version: 1, status: "completed" });
    expect(await saveProductTourStatus(tour.id, tour.version, "dismissed")).toEqual({
      ok: true,
      value: undefined,
    });
    expect((await getProductTourState(db, "tour-owner"))?.progress).toEqual(
      expect.arrayContaining([
        { tourId: tour.id, version: tour.version, status: "dismissed" },
        { tourId: "another-feature", version: 1, status: "completed" },
      ]),
    );
    expect((await getProductTourState(db, "tour-other"))?.progress).toEqual([]);
  });
  it("supports replay completion and resists a stale dismissal", async () => {
    await saveProductTourStatus(tour.id, tour.version, "dismissed");
    await saveProductTourStatus(tour.id, tour.version, "completed");
    await saveProductTourStatus(tour.id, tour.version, "dismissed");
    expect((await getProductTourState(db, "tour-owner"))?.progress).toEqual([
      { tourId: tour.id, version: tour.version, status: "completed" },
    ]);
  });
  it("never replaces progress saved by a newer deployment", async () => {
    await db.insert(userProductTours).values({
      userId: "tour-owner",
      tourId: tour.id,
      version: tour.version + 1,
      status: "completed",
    });
    await saveProductTourStatus(tour.id, tour.version, "completed");
    expect((await getProductTourState(db, "tour-owner"))?.progress[0]?.version).toBe(
      tour.version + 1,
    );
  });
  it("rejects invalid input without writing", async () => {
    for (const [id, version, status] of [
      ["unknown", 1, "completed"],
      [tour.id, 0, "completed"],
      [tour.id, tour.version, "pending"],
    ] as const) {
      expect((await saveProductTourStatus(id, version, status)).ok).toBe(false);
    }
    expect(await db.select().from(userProductTours)).toEqual([]);
  });
  it("new accounts get welcome copy independently of their activity", async () => {
    expect(await getProductTourState(db, "tour-owner")).toEqual({ returning: false, progress: [] });
    await db.update(user).set({ productTourReturning: true }).where(eq(user.id, "tour-owner"));
    expect(await getProductTourState(db, "tour-owner")).toEqual({ returning: true, progress: [] });
  });
});
