import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createJournalEntry,
  createUndatedSend,
  deleteJournalEntry,
  updateJournalEntry,
  updateSend,
} from "@/actions";
import { createDb } from "@/db/client";
import * as queries from "@/db/queries";
import { climbs, journalEntries, sends } from "@/db/schema";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/action-result";
import { allowJournalWrite } from "@/lib/rate-limit";
import {
  seedFixtureJournalEntry,
  seedFixtureSend,
  seedFixtureTree,
  seedFixtureUser,
} from "@/test/fixtures";

const sessionState = vi.hoisted(() => ({ userId: "j-user" as string | null }));

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

vi.mock("@/lib/rate-limit", () => ({
  allowJournalWrite: vi.fn<() => Promise<boolean>>(async () => true),
}));

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return {
    ...actual,
    getDb: async () => actual.createDb(env.DB),
  };
});

const db = createDb(env.DB);

const HIGHBALL = 1;
const SLAB = 2;
const CRIMPER = 3;

function entryFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const fields: Record<string, string> = {
    kind: "session",
    climbId: String(HIGHBALL),
    entryDate: "2026-03-01",
    body: "Good session.",
    ...overrides,
  };
  if (fields.kind === "training") delete fields.climbId;
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

function ascentFormData(overrides: Record<string, string> = {}): FormData {
  return entryFormData({
    climbId: String(HIGHBALL),
    sent: "true",
    ascentStyle: "flash",
    rating: "4",
    suggestedGrade: "5",
    gradeFeel: "solid",
    ...overrides,
  });
}

function entriesFor(userId: string) {
  return db.select().from(journalEntries).where(eq(journalEntries.userId, userId));
}

function sendFor(userId: string, climbId: number) {
  return db
    .select()
    .from(sends)
    .where(and(eq(sends.userId, userId), eq(sends.climbId, climbId)))
    .get();
}

beforeAll(async () => {
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "j-user", name: "Journal Writer" });
  await seedFixtureUser(db, { id: "j-other", name: "Someone Else" });
});

beforeEach(async () => {
  sessionState.userId = "j-user";
  vi.mocked(allowJournalWrite).mockResolvedValue(true);
  await db.delete(journalEntries);
  await db.delete(sends);
});

function undatedFormData(overrides: Record<string, string> = {}) {
  return ascentFormData({ dateSent: "", comment: "Original ascent.", ...overrides });
}

const OWNER = { id: "j-user", isPrivate: false, journalVisibility: "private" as const };

describe("unknown-date sends", () => {
  it("saves the send and aggregates without inventing a journal day", async () => {
    expect((await createUndatedSend(undatedFormData())).ok).toBe(true);
    expect(await sendFor("j-user", HIGHBALL)).toMatchObject({
      dateSent: null,
      comment: "Original ascent.",
      ascentStyle: "flash",
      rating: 4,
      suggestedGrade: 5,
      gradeFeel: "solid",
    });
    expect(await entriesFor("j-user")).toEqual([]);
    expect(await db.select().from(climbs).where(eq(climbs.id, HIGHBALL)).get()).toMatchObject({
      sendCount: 1,
      ratingSum: 4,
      ratingCount: 1,
    });
    expect(await queries.getJournalCounts(db, OWNER.id, OWNER.id, "2026-03")).toMatchObject({
      entries: 0,
      days: 0,
      sentThisMonth: 0,
    });
  });

  it("requires authentication and respects the logging rate limit", async () => {
    sessionState.userId = null;
    expect(await createUndatedSend(undatedFormData())).toEqual({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE,
    });
    sessionState.userId = "j-user";
    vi.mocked(allowJournalWrite).mockResolvedValue(false);
    expect((await createUndatedSend(undatedFormData())).ok).toBe(false);
    expect(await sendFor("j-user", HIGHBALL)).toBeUndefined();
  });

  it.each<Record<string, string>>([
    { climbId: "" },
    { climbId: "99999" },
    { rating: "6" },
    { dateSent: "2026-03-01" },
    { ascentStyle: "invalid" },
  ])("rejects invalid or dated submissions: %j", async (overrides) => {
    expect((await createUndatedSend(undatedFormData(overrides))).ok).toBe(false);
    expect(await sendFor("j-user", HIGHBALL)).toBeUndefined();
    expect(await entriesFor("j-user")).toEqual([]);
  });

  it("does not overwrite an existing send", async () => {
    await createUndatedSend(undatedFormData());
    expect((await createUndatedSend(undatedFormData({ comment: "Replacement" }))).ok).toBe(false);
    expect(await sendFor("j-user", HIGHBALL)).toMatchObject({ comment: "Original ascent." });
  });

  it("keeps every dated repeat independent, even when logged out of order", async () => {
    await createUndatedSend(undatedFormData());
    for (const entryDate of ["2026-04-01", "2026-03-01"]) {
      expect(
        (await createJournalEntry(entryFormData({ sent: "true", entryDate, body: "Repeat." }))).ok,
      ).toBe(true);
    }
    const entries = await queries.getJournalForClimb(db, OWNER.id, OWNER.id, HIGHBALL);
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.sent && !entry.isAscent)).toBe(true);
    expect(await queries.getAscentEntryId(db, OWNER.id, HIGHBALL)).toBeUndefined();
    expect(
      (
        await updateJournalEntry(
          entries[0].id,
          entryFormData({
            sent: "true",
            entryDate: entries[0].entryDate,
            body: "Edited repeat.",
          }),
        )
      ).ok,
    ).toBe(true);
    expect((await deleteJournalEntry(entries[1].id)).ok).toBe(true);
    expect(await sendFor("j-user", HIGHBALL)).toMatchObject({
      dateSent: null,
      comment: "Original ascent.",
    });
    expect(await db.select().from(climbs).where(eq(climbs.id, HIGHBALL)).get()).toMatchObject({
      sendCount: 1,
    });
  });

  it("can edit an undated send with repeats without changing their notes", async () => {
    await createUndatedSend(undatedFormData());
    await createJournalEntry(entryFormData({ sent: "true", body: "Repeat." }));
    const send = await sendFor("j-user", HIGHBALL);
    expect(
      (await updateSend(send!.id, undatedFormData({ comment: "Updated original.", rating: "5" })))
        .ok,
    ).toBe(true);
    expect(await sendFor("j-user", HIGHBALL)).toMatchObject({
      dateSent: null,
      comment: "Updated original.",
      rating: 5,
    });
    expect(await entriesFor("j-user")).toMatchObject([{ body: "Repeat.", isAscent: false }]);
  });

  it.each(["2026-02-01", "2026-03-01"])(
    "adds the original date %s without converting a repeat into the ascent",
    async (dateSent) => {
      await createUndatedSend(undatedFormData());
      await createJournalEntry(
        entryFormData({ sent: "true", entryDate: "2026-03-01", body: "Repeat." }),
      );
      const [repeat] = await entriesFor("j-user");
      const send = await sendFor("j-user", HIGHBALL);
      expect((await updateSend(send!.id, undatedFormData({ dateSent }))).ok).toBe(true);
      const entries = await queries.getJournalForClimb(db, OWNER.id, OWNER.id, HIGHBALL);
      const ascent = entries.find((entry) => entry.isAscent);
      expect(ascent).toMatchObject({ entryDate: dateSent, body: "Original ascent." });
      expect(ascent?.id).not.toBe(repeat.id);
      expect(entries.find((entry) => entry.id === repeat.id)).toMatchObject({
        entryDate: "2026-03-01",
        body: "Repeat.",
        isAscent: false,
      });
      expect(await queries.getAscentEntryId(db, OWNER.id, HIGHBALL)).toBe(ascent?.id);
      expect((await deleteJournalEntry(repeat.id)).ok).toBe(true);
      expect(await sendFor("j-user", HIGHBALL)).toBeDefined();
    },
  );

  it("rejects an original date after a repeat without changing either record", async () => {
    await createUndatedSend(undatedFormData());
    await createJournalEntry(entryFormData({ sent: "true", body: "Repeat." }));
    const send = await sendFor("j-user", HIGHBALL);
    expect(await updateSend(send!.id, undatedFormData({ dateSent: "2026-04-01" }))).toEqual({
      ok: false,
      error: "The ascent date can't be later than a logged repeat",
    });
    expect(await sendFor("j-user", HIGHBALL)).toMatchObject({
      dateSent: null,
      comment: "Original ascent.",
    });
    expect(await entriesFor("j-user")).toMatchObject([{ isAscent: false, body: "Repeat." }]);
  });

  it("still requires dates for sessions, training and repeats", async () => {
    await createUndatedSend(undatedFormData());
    const cases: Record<string, string>[] = [{}, { kind: "training" }, { sent: "true" }];
    for (const overrides of cases) {
      expect(await createJournalEntry(entryFormData({ ...overrides, entryDate: "" }))).toEqual({
        ok: false,
        error: "Entry date is required",
      });
    }
    expect(await entriesFor("j-user")).toEqual([]);
  });
});

describe("createJournalEntry", () => {
  it("writes a session and no send", async () => {
    await seedFixtureSend(db, { userId: "j-user", climbId: SLAB, dateSent: null, rating: 4 });
    const sendsBefore = await db.select().from(sends).orderBy(sends.id);
    const result = await createJournalEntry(entryFormData());
    expect(result).toEqual({ ok: true, value: undefined });

    const entries = await entriesFor("j-user");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "session", sent: false, climbId: HIGHBALL });
    expect(await db.select().from(sends).orderBy(sends.id)).toEqual(sendsBefore);
  });

  it("stores normalized tags", async () => {
    const formData = entryFormData({ kind: "training", body: "Hangboard." });
    formData.append("tag", " Hangboard ");
    formData.append("tag", "HANGBOARD");
    formData.append("tag", "Max-Hangs");

    await createJournalEntry(formData);
    const entries = await entriesFor("j-user");
    expect(entries[0]?.tags).toEqual(["hangboard", "max-hangs"]);
  });

  it("rejects tags containing spaces", async () => {
    const formData = entryFormData({ kind: "training", body: "Hangboard." });
    formData.append("tag", "max hangs");

    expect(await createJournalEntry(formData)).toEqual({
      ok: false,
      error: 'Tag "max hangs" can only contain letters, numbers and hyphens',
    });
    expect(await entriesFor("j-user")).toEqual([]);
  });

  it("returns a validation message rather than throwing", async () => {
    const result = await createJournalEntry(entryFormData({ climbId: "" }));
    expect(result).toEqual({ ok: false, error: "Pick a climb for an outdoor session" });
    expect(await entriesFor("j-user")).toEqual([]);
  });

  it("rejects a climb that doesn't exist", async () => {
    const result = await createJournalEntry(entryFormData({ climbId: "9999" }));
    expect(result).toEqual({ ok: false, error: "Climb not found" });
  });

  it("maps a missing session to the friendly message", async () => {
    sessionState.userId = null;
    expect(await createJournalEntry(entryFormData())).toEqual({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE,
    });
  });

  it("refuses once the rate limit is spent, before writing anything", async () => {
    vi.mocked(allowJournalWrite).mockResolvedValue(false);
    const result = await createJournalEntry(entryFormData());
    expect(result.ok).toBe(false);
    expect(await entriesFor("j-user")).toEqual([]);
  });

  describe("an ascent", () => {
    it("writes the entry and the send together", async () => {
      const result = await createJournalEntry(ascentFormData());
      expect(result.ok).toBe(true);

      const entries = await entriesFor("j-user");
      expect(entries[0]).toMatchObject({ climbId: HIGHBALL, sent: true });

      const send = await sendFor("j-user", HIGHBALL);
      expect(send).toMatchObject({
        ascentStyle: "flash",
        rating: 4,
        suggestedGrade: 5,
        dateSent: "2026-03-01",
        comment: "Good session.",
      });
    });

    it("moves the climb's public aggregates, via the triggers", async () => {
      await createJournalEntry(ascentFormData());
      const climb = await db.select().from(climbs).where(eq(climbs.id, HIGHBALL)).get();
      expect(climb).toMatchObject({ sendCount: 1, ratingSum: 4, ratingCount: 1 });
    });

    it("logs a second sent session as a repeat, leaving the send alone", async () => {
      await createJournalEntry(ascentFormData());
      const result = await createJournalEntry(
        entryFormData({ climbId: String(HIGHBALL), sent: "true", entryDate: "2026-04-01" }),
      );
      expect(result.ok).toBe(true);

      expect(await entriesFor("j-user")).toHaveLength(2);
      const send = await sendFor("j-user", HIGHBALL);
      expect(send?.dateSent).toBe("2026-03-01");

      const climb = await db.select().from(climbs).where(eq(climbs.id, HIGHBALL)).get();
      expect(climb?.sendCount).toBe(1);
    });

    it("rejects a repeat earlier than the recorded ascent", async () => {
      await createJournalEntry(ascentFormData({ entryDate: "2026-03-01" }));
      const result = await createJournalEntry(
        entryFormData({ climbId: String(HIGHBALL), sent: "true", entryDate: "2026-02-01" }),
      );

      expect(result).toEqual({
        ok: false,
        error: "A repeat can't be earlier than the recorded ascent",
      });
      expect(await entriesFor("j-user")).toHaveLength(1);
      expect((await sendFor("j-user", HIGHBALL))?.dateSent).toBe("2026-03-01");
    });

    it("preserves the original unknown date and note when logging a repeat", async () => {
      await seedFixtureSend(db, {
        userId: "j-user",
        climbId: HIGHBALL,
        dateSent: null,
        comment: "Imported without a date.",
      });

      const result = await createJournalEntry(
        entryFormData({ climbId: String(HIGHBALL), sent: "true", body: "Repeat." }),
      );

      expect(result).toEqual({ ok: true, value: undefined });
      expect(await entriesFor("j-user")).toMatchObject([
        { climbId: HIGHBALL, sent: true, entryDate: "2026-03-01", body: "Repeat." },
      ]);
      expect(await sendFor("j-user", HIGHBALL)).toMatchObject({
        dateSent: null,
        comment: "Imported without a date.",
      });
    });

    it("preserves a dated send when recovering its missing journal history", async () => {
      await seedFixtureSend(db, {
        userId: "j-user",
        climbId: HIGHBALL,
        dateSent: "2026-02-01",
        comment: "Original ascent.",
      });

      const result = await createJournalEntry(
        entryFormData({ sent: "true", entryDate: "2026-03-01", body: "Repeat." }),
      );

      expect(result.ok).toBe(true);
      expect(await sendFor("j-user", HIGHBALL)).toMatchObject({
        dateSent: "2026-02-01",
        comment: "Original ascent.",
      });
      expect((await entriesFor("j-user")).sort((a, b) => a.id - b.id)).toMatchObject([
        { sent: true, entryDate: "2026-02-01", body: "Original ascent." },
        { sent: true, entryDate: "2026-03-01", body: "Repeat." },
      ]);
    });

    it("rejects a repeat before a dated send even when its journal history is missing", async () => {
      await seedFixtureSend(db, {
        userId: "j-user",
        climbId: HIGHBALL,
        dateSent: "2026-04-01",
      });

      const result = await createJournalEntry(entryFormData({ sent: "true" }));

      expect(result.ok).toBe(false);
      expect(await entriesFor("j-user")).toEqual([]);
      expect((await sendFor("j-user", HIGHBALL))?.dateSent).toBe("2026-04-01");
    });

    it("refuses a rating or grade on a repeat", async () => {
      await createJournalEntry(ascentFormData());
      const result = await createJournalEntry(ascentFormData({ entryDate: "2026-04-01" }));
      expect(result).toEqual({ ok: false, error: "A repeat doesn't carry a rating or a grade" });
      expect(await entriesFor("j-user")).toHaveLength(1);
    });

    it("validates the suggested grade against the climb's own scale", async () => {
      const result = await createJournalEntry(
        ascentFormData({ climbId: String(CRIMPER), suggestedGrade: "999" }),
      );
      expect(result).toEqual({ ok: false, error: "Invalid suggested grade" });
      expect(await entriesFor("j-user")).toEqual([]);
    });
  });
});

describe("updateJournalEntry", () => {
  async function seedOwn(overrides: Record<string, unknown> = {}) {
    await seedFixtureJournalEntry(db, {
      userId: "j-user",
      entryDate: "2026-03-01",
      body: "Before.",
      ...overrides,
    });
    const [entry] = await entriesFor("j-user");
    return entry;
  }

  it("edits the note, date and tags", async () => {
    const entry = await seedOwn();
    const formData = entryFormData({ entryDate: "2026-02-14", body: "After." });
    formData.append("tag", "Slab");

    const result = await updateJournalEntry(entry.id, formData);
    expect(result.ok).toBe(true);

    const [updated] = await entriesFor("j-user");
    expect(updated).toMatchObject({ entryDate: "2026-02-14", body: "After.", tags: ["slab"] });
  });

  it("keeps an ascent's journal note and send comment in sync", async () => {
    await createJournalEntry(ascentFormData({ body: "Before." }));
    const [entry] = await entriesFor("j-user");

    const result = await updateJournalEntry(
      entry.id,
      entryFormData({
        climbId: String(HIGHBALL),
        sent: "true",
        body: "After.",
      }),
    );

    expect(result.ok).toBe(true);
    expect((await entriesFor("j-user"))[0]?.body).toBe("After.");
    expect((await sendFor("j-user", HIGHBALL))?.comment).toBe("After.");
  });

  it("refuses somebody else's entry", async () => {
    const entry = await seedOwn();
    sessionState.userId = "j-other";
    expect(await updateJournalEntry(entry.id, entryFormData())).toEqual({
      ok: false,
      error: "Entry not found",
    });
    expect(await entriesFor("j-user")).toEqual([entry]);
  });

  it("won't turn a session into a send", async () => {
    const entry = await seedOwn({ climbId: SLAB });
    const result = await updateJournalEntry(
      entry.id,
      entryFormData({ climbId: String(SLAB), sent: "true" }),
    );
    expect(result.ok).toBe(false);
    expect(await sendFor("j-user", SLAB)).toBeUndefined();
    expect(await entriesFor("j-user")).toEqual([entry]);
  });

  it("won't move an entry to another climb", async () => {
    const entry = await seedOwn({ climbId: SLAB });
    const result = await updateJournalEntry(entry.id, entryFormData({ climbId: String(HIGHBALL) }));
    expect(result.ok).toBe(false);
    expect(await entriesFor("j-user")).toEqual([entry]);
  });

  it("won't backdate a repeat ahead of the ascent", async () => {
    await createJournalEntry(ascentFormData());
    await createJournalEntry(
      entryFormData({ climbId: String(HIGHBALL), sent: "true", entryDate: "2026-04-01" }),
    );
    const repeat = (await entriesFor("j-user")).find((entry) => entry.entryDate === "2026-04-01");
    expect(repeat).toBeDefined();

    const result = await updateJournalEntry(
      repeat!.id,
      entryFormData({ climbId: String(HIGHBALL), sent: "true", entryDate: "2026-02-01" }),
    );
    expect(result).toEqual({
      ok: false,
      error: "A sent session's date can't be changed after it is logged",
    });

    expect((await sendFor("j-user", HIGHBALL))?.dateSent).toBe("2026-03-01");
    expect((await entriesFor("j-user")).find((entry) => entry.id === repeat!.id)?.entryDate).toBe(
      "2026-04-01",
    );
    expect((await deleteJournalEntry(repeat!.id)).ok).toBe(true);
    expect(await sendFor("j-user", HIGHBALL)).toBeDefined();
  });
});

describe("deleteJournalEntry", () => {
  it("takes the send with the session that carries the ascent", async () => {
    await createJournalEntry(ascentFormData());
    const [entry] = await entriesFor("j-user");

    const result = await deleteJournalEntry(entry.id);
    expect(result.ok).toBe(true);

    expect(await entriesFor("j-user")).toEqual([]);
    expect(await sendFor("j-user", HIGHBALL)).toBeUndefined();

    const climb = await db.select().from(climbs).where(eq(climbs.id, HIGHBALL)).get();
    expect(climb).toMatchObject({ sendCount: 0, ratingSum: 0, ratingCount: 0 });
  });

  it("does not delete a replacement send created after the ascent was read", async () => {
    await createJournalEntry(ascentFormData());
    const [entry] = await entriesFor("j-user");
    const getAscentEntryId = queries.getAscentEntryId;
    const spy = vi.spyOn(queries, "getAscentEntryId").mockImplementationOnce(async (...args) => {
      const id = await getAscentEntryId(...args);
      await db.delete(sends).where(eq(sends.userId, "j-user"));
      await seedFixtureSend(db, {
        userId: "j-user",
        climbId: HIGHBALL,
        dateSent: "2026-04-01",
        comment: "Replacement.",
      });
      await seedFixtureJournalEntry(db, {
        userId: "j-user",
        climbId: HIGHBALL,
        entryDate: "2026-04-01",
        body: "Replacement.",
        sent: true,
        isAscent: true,
      });
      return id;
    });

    try {
      expect((await deleteJournalEntry(entry.id)).ok).toBe(true);
      expect(await sendFor("j-user", HIGHBALL)).toMatchObject({ dateSent: "2026-04-01" });
      expect(await entriesFor("j-user")).toMatchObject([
        { entryDate: "2026-04-01", sent: true, body: "Replacement." },
      ]);
    } finally {
      spy.mockRestore();
    }
  });

  it("leaves the send alone when the deleted session is a repeat", async () => {
    await createJournalEntry(ascentFormData());
    await createJournalEntry(
      entryFormData({ climbId: String(HIGHBALL), sent: "true", entryDate: "2026-04-01" }),
    );
    const entries = await entriesFor("j-user");
    const repeat = entries.find((entry) => entry.entryDate === "2026-04-01");
    expect(repeat).toBeDefined();

    const result = await deleteJournalEntry(repeat!.id);
    expect(result.ok).toBe(true);

    expect(await entriesFor("j-user")).toHaveLength(1);
    expect(await sendFor("j-user", HIGHBALL)).toBeDefined();
  });

  it("keeps later sessions but clears their sent state when deleting the ascent", async () => {
    await createJournalEntry(ascentFormData());
    await createJournalEntry(
      entryFormData({ climbId: String(HIGHBALL), sent: "true", entryDate: "2026-04-01" }),
    );
    const entries = await entriesFor("j-user");
    const ascent = entries.find((entry) => entry.entryDate === "2026-03-01");

    expect((await deleteJournalEntry(ascent!.id)).ok).toBe(true);
    expect(await sendFor("j-user", HIGHBALL)).toBeUndefined();
    expect(await entriesFor("j-user")).toMatchObject([{ entryDate: "2026-04-01", sent: false }]);
  });

  it("deletes a plain session without touching sends", async () => {
    await seedFixtureSend(db, { userId: "j-user", climbId: SLAB, dateSent: null, rating: 4 });
    const sendsBefore = await db.select().from(sends).orderBy(sends.id);
    await seedFixtureJournalEntry(db, {
      userId: "j-user",
      entryDate: "2026-03-01",
      body: "Gym.",
    });
    const [entry] = await entriesFor("j-user");
    expect((await deleteJournalEntry(entry.id)).ok).toBe(true);
    expect(await entriesFor("j-user")).toEqual([]);
    expect(await db.select().from(sends).orderBy(sends.id)).toEqual(sendsBefore);
  });

  it("refuses somebody else's entry", async () => {
    await seedFixtureJournalEntry(db, { userId: "j-user", entryDate: "2026-03-01", body: "Mine." });
    const [entry] = await entriesFor("j-user");

    sessionState.userId = "j-other";
    expect(await deleteJournalEntry(entry.id)).toEqual({ ok: false, error: "Entry not found" });
    expect(await entriesFor("j-user")).toHaveLength(1);
  });
});
