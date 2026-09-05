import { env } from "cloudflare:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { importSends, resolveImportClimbs, resolveImportClimbsInAreas } from "@/actions";
import { createDb } from "@/db/client";
import { climbs, journalEntries, sends } from "@/db/schema";
import { GENERIC_ERROR_MESSAGE } from "@/lib/action-result";
import {
  IMPORT_BATCH_SIZE,
  MAX_COMMENT_LENGTH,
  RESOLVE_BATCH_SIZE,
  type ImportSendRow,
} from "@/lib/sends";
import {
  seedFixtureJournalEntry,
  seedFixtureSend,
  seedFixtureTree,
  seedFixtureUser,
  seedManyClimbs,
} from "@/test/fixtures";

/** importSends's commit contract: each call is all-or-nothing (one db.batch
 * = one D1 transaction), duplicate rows are skipped via the user+climb key
 * so retries are safe, and every surface the write touches is revalidated.
 * These tests pin all three. */

const sessionState = vi.hoisted(() => ({ userId: "import-user" as string | null }));

const cacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn<(path: string) => void>(),
  refresh: vi.fn<() => void>(),
}));

vi.mock("next/cache", () => cacheMocks);

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

// Point the action's getDb at the test D1 binding, and count db.batch calls
// on the way through — the atomicity contract rests on the whole commit
// riding in ONE batch, so the count is asserted below.
const batchCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return {
    ...actual,
    getDb: async () => {
      const db = actual.createDb(env.DB);
      const originalBatch = db.batch.bind(db) as (
        statements: readonly unknown[],
      ) => Promise<unknown>;
      Object.assign(db, {
        batch: (statements: readonly unknown[]) => {
          batchCalls.count += 1;
          return originalBatch(statements);
        },
      });
      return db;
    },
  };
});

const db = createDb(env.DB);

function importRow(climbId: number, overrides: Partial<ImportSendRow> = {}): ImportSendRow {
  return {
    climbId,
    ascentStyle: "redpoint",
    dateSent: "2026-01-10",
    rating: null,
    comment: null,
    gradeText: null,
    blankGradeMeans: "posted-grade",
    gradeFeel: "solid",
    ...overrides,
  };
}

/** "Bulk Climb 0" ... "Bulk Climb 59" (ids 100...159) live in Test Slab Area. */
function bulkRows(from: number, to: number): ImportSendRow[] {
  return Array.from({ length: to - from + 1 }, (_, i) => importRow(100 + from + i));
}

// Stable catalogue; each test rebuilds its own send and journal state.
beforeAll(async () => {
  await seedFixtureTree(db);
  await seedManyClimbs(db, 5, 60, 100);
  for (const id of [
    "import-user",
    "retry-user",
    "reval-user",
    "noop-user",
    "hostile-user",
    "rating-user",
    "coerce-user",
    "reject-user",
    "grade-user",
    "comment-user",
    "overwrite-user",
    "overwrite-null-user",
  ]) {
    await seedFixtureUser(db, { id });
  }
});

// Every call uses skip mode except the overwrite suite at the bottom.
const IMPORT_OPTIONS = { gradeScale: "native", onConflict: "skip" } as const;

beforeEach(async () => {
  await db.delete(journalEntries);
  await db.delete(sends);
  await seedFixtureSend(db, { userId: "noop-user", climbId: 2, dateSent: null });
  sessionState.userId = "import-user";
  batchCalls.count = 0;
  cacheMocks.revalidatePath.mockClear();
  cacheMocks.refresh.mockClear();
});

describe("importSends atomic commit", () => {
  it("uses the imported comment as the ascent journal note", async () => {
    sessionState.userId = "comment-user";
    const result = await importSends(
      [importRow(159, { comment: "Imported note." })],
      IMPORT_OPTIONS,
    );

    expect(result.ok).toBe(true);
    const entry = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, "comment-user"))
      .get();
    expect(entry?.body).toBe("Imported note.");
  });

  it("commits a 25-row batch in a single db.batch and reports the committed count", async () => {
    const result = await importSends(bulkRows(0, 24), IMPORT_OPTIONS);

    expect(result).toEqual({
      ok: true,
      value: { imported: 25, overwritten: 0, alreadyLogged: 0, missing: [] },
    });
    // One batch total, even though the insert is split into three <=10-row
    // statements (D1's bound-parameter cap) — the chunks ride inside the same
    // atomic batch, and the climbs aggregates follow from triggers within it.
    expect(batchCalls.count).toBe(1);

    const rows = await db.select().from(sends).where(eq(sends.userId, "import-user")).all();
    expect(rows).toHaveLength(25);
    const entries = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, "import-user"))
      .all();
    expect(entries).toHaveLength(25);
    expect(entries.every((entry) => entry.sent && entry.kind === "session")).toBe(true);
    const climb = await db.select().from(climbs).where(eq(climbs.id, 100)).get();
    expect(climb?.sendCount).toBe(1);
  });

  it("commits nothing when the batch fails partway (no partial import)", async () => {
    // A real user lets the first INSERT chunk succeed. Reject the last row
    // in a later chunk, so sequential execution would leave partial data.
    sessionState.userId = "import-user";
    await db.run(sql`CREATE TRIGGER test_import_late_failure BEFORE INSERT ON sends
      WHEN NEW.climb_id = 136
      BEGIN SELECT RAISE(ABORT, 'test import late failure'); END`);
    let result;
    try {
      result = await importSends(
        bulkRows(25, 36).map((row) => ({ ...row, rating: 4 })),
        IMPORT_OPTIONS,
      );
    } finally {
      await db.run(sql`DROP TRIGGER test_import_late_failure`);
    }

    expect(result).toEqual({ ok: false, error: GENERIC_ERROR_MESSAGE });
    expect(await db.select().from(sends).where(eq(sends.userId, "import-user")).all()).toHaveLength(
      0,
    );
    expect(
      await db.select().from(journalEntries).where(eq(journalEntries.userId, "import-user")).all(),
    ).toHaveLength(0);
    const bulkIds = Array.from({ length: 12 }, (_, i) => 125 + i);
    const touched = await db.select().from(climbs).where(inArray(climbs.id, bulkIds)).all();
    expect(
      touched
        .map((c) => ({
          id: c.id,
          sendCount: c.sendCount,
          ratingSum: c.ratingSum,
          ratingCount: c.ratingCount,
          avgRating: c.avgRating,
        }))
        .sort((a, b) => a.id - b.id),
    ).toEqual(
      bulkIds.map((id) => ({ id, sendCount: 0, ratingSum: 0, ratingCount: 0, avgRating: null })),
    );
    // Nothing committed, so nothing to revalidate.
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalled();
    expect(cacheMocks.refresh).not.toHaveBeenCalled();
  });

  it("skips already-logged sends on a retry instead of duplicating them", async () => {
    sessionState.userId = "retry-user";
    const rows = bulkRows(37, 39);

    const first = await importSends(rows, IMPORT_OPTIONS);
    expect(first).toEqual({
      ok: true,
      value: { imported: 3, overwritten: 0, alreadyLogged: 0, missing: [] },
    });

    const second = await importSends(rows, IMPORT_OPTIONS);
    expect(second).toEqual({
      ok: true,
      value: { imported: 0, overwritten: 0, alreadyLogged: 3, missing: [] },
    });

    expect(await db.select().from(sends).where(eq(sends.userId, "retry-user")).all()).toHaveLength(
      3,
    );
    expect(
      await db.select().from(journalEntries).where(eq(journalEntries.userId, "retry-user")).all(),
    ).toHaveLength(3);
    const climb = await db.select().from(climbs).where(eq(climbs.id, 137)).get();
    expect(climb?.sendCount).toBe(1); // not double-counted by the retry
  });
});

describe("importSends revalidation", () => {
  it("revalidates the home page, the user, and every affected climb and area", async () => {
    sessionState.userId = "reval-user";
    // Test Highball = climb 1 in area 4; Test Crimper = climb 3 in area 3.
    const result = await importSends([importRow(1), importRow(3)], IMPORT_OPTIONS);
    expect(result.ok).toBe(true);

    const paths = cacheMocks.revalidatePath.mock.calls.map((call) => call[0]);
    expect(new Set(paths)).toEqual(
      new Set([
        "/",
        "/feed",
        "/users/reval-user",
        "/users/reval-user/journal",
        "/users/reval-user/sends",
        "/users/reval-user/projects",
        "/users/reval-user/analytics",
        "/climbs/1",
        "/climbs/3",
        "/areas/4",
        "/areas/3",
      ]),
    );
    expect(cacheMocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("revalidates nothing when no rows were written", async () => {
    sessionState.userId = "noop-user";
    const result = await importSends(
      [
        importRow(2), // Test Slab — already logged (seeded above)
        importRow(999_999), // no such climb: deleted since the match step
      ],
      IMPORT_OPTIONS,
    );

    expect(result).toEqual({
      ok: true,
      value: { imported: 0, overwritten: 0, alreadyLogged: 1, missing: [1] },
    });
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalled();
    expect(cacheMocks.refresh).not.toHaveBeenCalled();
  });
});

// importSends is a server action, so `rows` arrives over HTTP with its
// NormalizedImportRow type gone. Everything the wizard guarantees has to hold
// for a caller that never ran the wizard.
describe("importSends against a caller that skipped the wizard", () => {
  it("rejects a batch over IMPORT_BATCH_SIZE before running a single query", async () => {
    sessionState.userId = "hostile-user";
    const result = await importSends(bulkRows(0, IMPORT_BATCH_SIZE), IMPORT_OPTIONS);

    expect(result).toEqual({
      ok: false,
      error: `An import batch can carry at most ${IMPORT_BATCH_SIZE} rows`,
    });
    expect(batchCalls.count).toBe(0);
    expect(
      await db.select().from(sends).where(eq(sends.userId, "hostile-user")).all(),
    ).toHaveLength(0);
  });

  it("commits a batch of exactly IMPORT_BATCH_SIZE in one db.batch", async () => {
    sessionState.userId = "hostile-user";
    const result = await importSends(bulkRows(0, IMPORT_BATCH_SIZE - 1), IMPORT_OPTIONS);
    expect(result).toEqual({
      ok: true,
      value: { imported: IMPORT_BATCH_SIZE, overwritten: 0, alreadyLogged: 0, missing: [] },
    });
    expect(batchCalls.count).toBe(1);
  });

  it("rejects a non-array rows argument", async () => {
    sessionState.userId = "hostile-user";
    const result = await importSends(null as unknown as ImportSendRow[], IMPORT_OPTIONS);
    expect(result).toEqual({ ok: false, error: "Invalid import rows" });
  });

  it("rejects a row whose climb id isn't a positive integer", async () => {
    sessionState.userId = "hostile-user";
    for (const climbId of ["1", 1.5, -1, 0, null]) {
      const result = await importSends([importRow(climbId as unknown as number)], IMPORT_OPTIONS);
      expect(result).toEqual({ ok: false, error: "Invalid import rows" });
    }
    expect(batchCalls.count).toBe(0);
  });

  // climbs.avg_rating is generated from rating_sum, which the sends triggers
  // maintain, so an unchecked rating here would move a shared climb's public
  // average and its position in the rating sort for every user.
  it("stores an out-of-range rating as null, leaving the climb's average alone", async () => {
    sessionState.userId = "rating-user";
    const before = await db.select().from(climbs).where(eq(climbs.id, 130)).get();

    const result = await importSends([importRow(130, { rating: 1_000_000_000 })], IMPORT_OPTIONS);

    expect(result.ok).toBe(true);
    const send = await db.select().from(sends).where(eq(sends.userId, "rating-user")).get();
    expect(send?.rating).toBeNull();

    const after = await db.select().from(climbs).where(eq(climbs.id, 130)).get();
    expect(after?.ratingSum).toBe(before?.ratingSum ?? 0);
    expect(after?.avgRating).toBe(before?.avgRating ?? null);
  });

  it("truncates an over-long comment and defaults an unknown grade feel", async () => {
    sessionState.userId = "coerce-user";
    const result = await importSends(
      [
        importRow(131, {
          comment: "x".repeat(MAX_COMMENT_LENGTH + 5000),
          gradeFeel: "pwned" as ImportSendRow["gradeFeel"],
        }),
      ],
      IMPORT_OPTIONS,
    );

    expect(result.ok).toBe(true);
    const send = await db.select().from(sends).where(eq(sends.userId, "coerce-user")).get();
    expect(send?.comment).toHaveLength(MAX_COMMENT_LENGTH);
    expect(send?.gradeFeel).toBe("solid");
  });

  // A row the wizard would have refused to produce fails the whole call
  // rather than being silently dropped — the commit contract is unchanged.
  async function expectRejected(overrides: Partial<ImportSendRow>, message: string): Promise<void> {
    sessionState.userId = "reject-user";
    const result = await importSends([importRow(132, overrides)], IMPORT_OPTIONS);

    expect(result).toEqual({ ok: false, error: message });
    expect(await db.select().from(sends).where(eq(sends.userId, "reject-user")).all()).toHaveLength(
      0,
    );
  }

  it("rejects a future date", async () => {
    await expectRejected({ dateSent: "2099-01-01" }, "Send date can't be in the future");
  });

  it("rejects a malformed date", async () => {
    await expectRejected({ dateSent: "01/02/2026" }, "Invalid send date");
  });

  it("rejects an unknown ascent style", async () => {
    await expectRejected(
      { ascentStyle: "sandbagged" as ImportSendRow["ascentStyle"] },
      "Invalid ascent style",
    );
  });
});

describe("importSends suggested grade", () => {
  it("parses grade text against the resolved climb's type, and falls back per blankGradeMeans", async () => {
    sessionState.userId = "grade-user";
    const result = await importSends(
      [
        importRow(133, { gradeText: "V7" }), // boulder table: V7 -> 8
        importRow(134, { gradeText: null, blankGradeMeans: "posted-grade" }), // Bulk Climb 34 is graded 34 % 19 = 15
        importRow(135, { gradeText: null, blankGradeMeans: "no-suggestion" }),
        importRow(136, { gradeText: "5.12a" }), // a route grade on a boulder: no suggestion
      ],
      IMPORT_OPTIONS,
    );
    expect(result.ok).toBe(true);

    const rows = await db.select().from(sends).where(eq(sends.userId, "grade-user")).all();
    const byClimb = new Map(rows.map((row) => [row.climbId, row.suggestedGrade]));
    expect(byClimb.get(133)).toBe(8);
    expect(byClimb.get(134)).toBe(15);
    expect(byClimb.get(135)).toBeNull();
    expect(byClimb.get(136)).toBeNull();
  });
});

describe("importSends overwrite mode", () => {
  it("replaces an already-logged send's values wholesale, in one db.batch, without double counting", async () => {
    sessionState.userId = "overwrite-user";
    // 150/151: past the 100-149 range the "exactly IMPORT_BATCH_SIZE" test
    // above already commits sends against, so this test's own aggregate
    // assertions aren't shared with another user's writes.
    const first = await importSends(
      [importRow(150, { rating: 3, comment: "first go", gradeText: "V5" })],
      IMPORT_OPTIONS,
    );
    expect(first.ok).toBe(true);
    batchCalls.count = 0;

    // Overwrite clears the fields the CSV leaves blank as well as replacing
    // the ones it fills. A second row for a climb not yet logged inserts as
    // usual in the same call.
    const second = await importSends(
      [
        importRow(150, {
          dateSent: "2026-02-10",
          rating: 5,
          comment: null,
          gradeText: "V6",
        }),
        importRow(151),
      ],
      { ...IMPORT_OPTIONS, onConflict: "overwrite" },
    );
    expect(second).toEqual({
      ok: true,
      value: { imported: 1, overwritten: 1, alreadyLogged: 0, missing: [] },
    });
    expect(batchCalls.count).toBe(1);

    const send = await db
      .select()
      .from(sends)
      .where(and(eq(sends.userId, "overwrite-user"), eq(sends.climbId, 150)))
      .get();
    expect(send?.rating).toBe(5);
    expect(send?.comment).toBeNull();
    expect(send?.suggestedGrade).toBe(7); // V6
    expect(send?.dateSent).toBe("2026-02-10");
    const entries = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, "overwrite-user"))
      .all();
    expect(entries).toHaveLength(2);
    expect(entries.find((entry) => entry.climbId === 150)).toMatchObject({
      entryDate: "2026-02-10",
      body: null,
    });
    const climb = await db.select().from(climbs).where(eq(climbs.id, 150)).get();
    expect(climb?.sendCount).toBe(1);
    expect(climb?.ratingSum).toBe(5);
  });

  it("won't clear a date that anchors journal history", async () => {
    sessionState.userId = "overwrite-null-user";
    expect((await importSends([importRow(152)], IMPORT_OPTIONS)).ok).toBe(true);
    const result = await importSends([importRow(152, { dateSent: null })], {
      ...IMPORT_OPTIONS,
      onConflict: "overwrite",
    });

    expect(result).toEqual({
      ok: false,
      error: "A send with journal history must keep its date",
    });
    const send = await db
      .select()
      .from(sends)
      .where(and(eq(sends.userId, "overwrite-null-user"), eq(sends.climbId, 152)))
      .get();
    expect(send?.dateSent).toBe("2026-01-10");
  });
});

describe("resolveImportClimbsInAreas", () => {
  it("returns the climbs of each name inside the paired area", async () => {
    const result = await resolveImportClimbsInAreas([
      { name: "Bulk Climb 0", areaName: "Test Boulders" },
      { name: "Bulk Climb 0", areaName: "Test Sport Wall" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((c) => c.id)).toEqual([100]);
    expect(result.value[0].ancestors.map((a) => a.name)).toEqual(["Test Crag", "Test Boulders"]);
  });

  it("rejects malformed pairs and requires a session", async () => {
    expect(
      await resolveImportClimbsInAreas([{ name: "x" } as { name: string; areaName: string }]),
    ).toEqual({
      ok: false,
      error: "Invalid climb names",
    });
    sessionState.userId = null;
    expect((await resolveImportClimbsInAreas([{ name: "x", areaName: "y" }])).ok).toBe(false);
  });

  it("rejects more pairs than RESOLVE_BATCH_SIZE", async () => {
    const tooMany = Array.from({ length: RESOLVE_BATCH_SIZE + 1 }, (_, i) => ({
      name: `Climb ${i}`,
      areaName: `Area ${i}`,
    }));
    expect(await resolveImportClimbsInAreas(tooMany)).toEqual({
      ok: false,
      error: `A lookup can carry at most ${RESOLVE_BATCH_SIZE} climb and area pairs`,
    });
  });
});

describe("resolveImportClimbs", () => {
  it("returns every climb sharing each name, grouped by key with its ancestors", async () => {
    const result = await resolveImportClimbs(["test highball", "Bulk Climb 0", "Nobody"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const keys = result.value.map((c) => c.key);
    expect(new Set(keys)).toEqual(new Set(["test highball", "bulk climb 0"]));
    const highball = result.value.find((c) => c.id === 1);
    expect(highball).toMatchObject({
      name: "Test Highball",
      type: "boulder",
      grade: 5,
      areaId: 4,
      areaName: "Test Highball Alcove",
      total: 1,
    });
    expect(highball?.ancestors.map((a) => a.name)).toEqual(["Test Crag", "Test Boulders"]);
  });

  it("requires a session", async () => {
    sessionState.userId = null;
    const result = await resolveImportClimbs(["Test Highball"]);
    expect(result.ok).toBe(false);
  });

  it("rejects more names than RESOLVE_BATCH_SIZE, and non-string names", async () => {
    const tooMany = Array.from({ length: RESOLVE_BATCH_SIZE + 1 }, (_, i) => `Climb ${i}`);
    expect(await resolveImportClimbs(tooMany)).toEqual({
      ok: false,
      error: `A lookup can carry at most ${RESOLVE_BATCH_SIZE} climb names`,
    });
    expect(await resolveImportClimbs([1 as unknown as string])).toEqual({
      ok: false,
      error: "Invalid climb names",
    });
  });
});

describe("overwriting undated sends with dated repeats", () => {
  it.each([null, "2026-02-01", "2026-03-01"])(
    "preserves repeats when importing original date %s",
    async (dateSent) => {
      const userId = `undated-overwrite-${dateSent}`;
      sessionState.userId = userId;
      await seedFixtureUser(db, { id: userId });
      await seedFixtureSend(db, { userId, climbId: 1, dateSent: null, comment: "Original." });
      await seedFixtureJournalEntry(db, {
        userId,
        climbId: 1,
        entryDate: "2026-03-01",
        sent: true,
        body: "Repeat.",
      });
      expect(
        (
          await importSends([importRow(1, { dateSent, comment: "Imported original." })], {
            onConflict: "overwrite",
            gradeScale: "native",
          })
        ).ok,
      ).toBe(true);
      expect(await db.select().from(sends).where(eq(sends.userId, userId)).get()).toMatchObject({
        dateSent,
        comment: "Imported original.",
      });
      const entries = await db
        .select()
        .from(journalEntries)
        .where(eq(journalEntries.userId, userId));
      expect(entries).toHaveLength(dateSent ? 2 : 1);
      expect(entries.find((entry) => !entry.isAscent)).toMatchObject({
        entryDate: "2026-03-01",
        isAscent: false,
        body: "Repeat.",
      });
      if (dateSent)
        expect(entries.find((entry) => entry.isAscent)).toMatchObject({
          entryDate: dateSent,
          isAscent: true,
          body: "Imported original.",
        });
    },
  );
});
