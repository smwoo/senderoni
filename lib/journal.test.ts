import { describe, expect, it } from "vitest";

import { ActionError } from "@/lib/action-result";
import {
  MAX_JOURNAL_BODY_LENGTH,
  MAX_JOURNAL_TAGS,
  MAX_JOURNAL_TAG_LENGTH,
  normalizeTag,
  normalizeTags,
  parseJournalVisibility,
  validateJournalInput,
  type RawJournalEntryInput,
  type JournalKind,
  type JournalVisibility,
} from "@/lib/journal";

const TODAY = "2026-03-15";

function raw(overrides: Partial<RawJournalEntryInput> = {}): RawJournalEntryInput {
  return {
    kind: "session",
    climbId: "7",
    sent: null,
    entryDate: TODAY,
    body: "Good day out.",
    tags: null,
    ...overrides,
  };
}

describe("normalizeTags", () => {
  it("lowercases and trims tags", () => {
    expect(normalizeTags([" Hangboard ", "Max-Hangs"])).toEqual(["hangboard", "max-hangs"]);
  });

  it("treats case and surrounding-whitespace variants as one tag, keeping typed order", () => {
    expect(normalizeTags(["Power", "endurance", "POWER ", " power"])).toEqual([
      "power",
      "endurance",
    ]);
  });

  it("skips blank chips rather than rejecting them", () => {
    expect(normalizeTags(["", "   ", "core"])).toEqual(["core"]);
  });

  it("returns [] for absent tags", () => {
    expect(normalizeTags(null)).toEqual([]);
    expect(normalizeTags(undefined)).toEqual([]);
  });

  it("dedupes before counting, so more chips than the cap can still pass", () => {
    const chips = Array.from({ length: MAX_JOURNAL_TAGS }, (_, i) => `tag-${i}`);
    expect(normalizeTags([...chips, ...chips.map((t) => t.toUpperCase())])).toHaveLength(
      MAX_JOURNAL_TAGS,
    );
  });

  it("rejects more distinct tags than the cap, naming the count", () => {
    const chips = Array.from({ length: MAX_JOURNAL_TAGS + 1 }, (_, i) => `tag-${i}`);
    expect(() => normalizeTags(chips)).toThrow(`${MAX_JOURNAL_TAGS + 1} tags`);
  });

  it("rejects an over-long tag", () => {
    expect(() => normalizeTags(["x".repeat(MAX_JOURNAL_TAG_LENGTH + 1)])).toThrow(
      `the limit is ${MAX_JOURNAL_TAG_LENGTH}`,
    );
  });

  it("rejects characters outside letters, numbers and hyphens", () => {
    expect(() => normalizeTags(["power!"])).toThrow("letters, numbers and hyphens");
    expect(() => normalizeTags(["power endurance"])).toThrow("letters, numbers and hyphens");
  });

  it("rejects a non-array and non-string members", () => {
    expect(() => normalizeTags("hangboard")).toThrow(ActionError);
    expect(() => normalizeTags([42])).toThrow(ActionError);
  });

  it("normalizes case and surrounding whitespace without admitting internal spaces", () => {
    expect(normalizeTags([" Happy-Boulders "])).toEqual(["happy-boulders"]);
    expect(normalizeTag(" Happy-Boulders ")).toBe("happy-boulders");
  });
});

describe("validateJournalInput", () => {
  it("accepts an outdoor session associated with a climb", () => {
    expect(validateJournalInput(raw(), TODAY)).toEqual({
      kind: "session",
      climbId: 7,
      sent: false,
      entryDate: TODAY,
      body: "Good day out.",
      tags: null,
    });
  });

  it("stores tags as null when there are none, not as an empty array", () => {
    expect(validateJournalInput(raw({ tags: [] }), TODAY).tags).toBeNull();
  });

  it("accepts a sent session against a climb", () => {
    const input = validateJournalInput(raw({ climbId: "7", sent: "true", body: null }), TODAY);
    expect(input).toMatchObject({ climbId: 7, sent: true, body: null });
  });

  it("rejects an outdoor session without a climb", () => {
    expect(() => validateJournalInput(raw({ climbId: null }), TODAY)).toThrow(
      "Pick a climb for an outdoor session",
    );
  });

  it("rejects a climb on a training entry", () => {
    expect(() => validateJournalInput(raw({ kind: "training", climbId: "7" }), TODAY)).toThrow(
      "Climb-specific entries are sessions, not training",
    );
  });

  it("rejects a sent training entry", () => {
    expect(() =>
      validateJournalInput(raw({ kind: "training", climbId: null, sent: "true" }), TODAY),
    ).toThrow("Training entries can't be marked as sends");
  });

  it("rejects training with neither a note nor a tag", () => {
    expect(() =>
      validateJournalInput(raw({ kind: "training", climbId: null, body: null }), TODAY),
    ).toThrow("Add a note or a tag so this records something");
  });

  it("accepts a training entry carried by tags alone", () => {
    const input = validateJournalInput(
      raw({ kind: "training", climbId: null, body: null, tags: ["hangboard"] }),
      TODAY,
    );
    expect(input).toMatchObject({ kind: "training", body: null, tags: ["hangboard"] });
  });

  it("accepts a session on a climb with no note — working a route records itself", () => {
    expect(validateJournalInput(raw({ climbId: "7", body: null }), TODAY)).toMatchObject({
      climbId: 7,
      body: null,
    });
  });

  it("accepts every stored kind", () => {
    for (const kind of ["session", "training"] satisfies JournalKind[]) {
      const climbId = kind === "session" ? "7" : null;
      expect(validateJournalInput(raw({ kind, climbId, body: "Notes." }), TODAY).kind).toBe(kind);
    }
  });

  it("rejects an unknown kind", () => {
    expect(() => validateJournalInput(raw({ kind: "projecting" }), TODAY)).toThrow(
      "Invalid entry kind",
    );
  });

  it("accepts a 1,000-character note", () => {
    const body = "x".repeat(1000);
    expect(validateJournalInput(raw({ body }), TODAY).body).toBe(body);
  });

  it("rejects a note over 1,000 characters", () => {
    const body = "x".repeat(MAX_JOURNAL_BODY_LENGTH + 1);
    expect(() => validateJournalInput(raw({ body }), TODAY)).toThrow(
      "Note is 1001 characters — the limit is 1,000",
    );
  });

  it("requires an entry date", () => {
    expect(() => validateJournalInput(raw({ entryDate: "  " }), TODAY)).toThrow(
      "Entry date is required",
    );
  });

  it("rejects a date the calendar doesn't have", () => {
    expect(() => validateJournalInput(raw({ entryDate: "2026-02-30" }), TODAY)).toThrow(
      "Invalid entry date",
    );
  });

  it("tolerates one day past UTC today, for a client at UTC+14", () => {
    expect(validateJournalInput(raw({ entryDate: "2026-03-16" }), TODAY).entryDate).toBe(
      "2026-03-16",
    );
  });

  it("rejects anything beyond that", () => {
    expect(() => validateJournalInput(raw({ entryDate: "2026-03-17" }), TODAY)).toThrow(
      "Entry date can't be in the future",
    );
  });
});

describe("parseJournalVisibility", () => {
  it("accepts every stored value", () => {
    for (const visibility of ["private", "friends", "public"] satisfies JournalVisibility[]) {
      expect(parseJournalVisibility(visibility)).toBe(visibility);
    }
  });

  it("rejects anything else", () => {
    expect(() => parseJournalVisibility("invalid")).toThrow(ActionError);
    expect(() => parseJournalVisibility(null)).toThrow(ActionError);
  });
});
