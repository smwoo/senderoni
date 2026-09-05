import { ActionError } from "@/lib/action-result";
import { MAX_LOG_NOTE_LENGTH } from "@/lib/log-note";
import { isRealIsoDate, latestAcceptableSendDate } from "@/lib/sends";
import { trimOrNull } from "@/lib/validation";

export { MAX_LOG_NOTE_LENGTH as MAX_JOURNAL_BODY_LENGTH } from "@/lib/log-note";

const JOURNAL_KINDS = ["session", "training"] as const;
export type JournalKind = (typeof JOURNAL_KINDS)[number];

const JOURNAL_VISIBILITIES = ["private", "friends", "public"] as const;
export type JournalVisibility = (typeof JOURNAL_VISIBILITIES)[number];

export const MAX_JOURNAL_TAGS = 8;
export const MAX_JOURNAL_TAG_LENGTH = 24;

export type JournalEntryInput = {
  kind: JournalKind;
  climbId: number | null;
  sent: boolean;
  entryDate: string;
  body: string | null;
  tags: string[] | null;
};

export type RawJournalEntryInput = {
  kind: FormDataEntryValue | null;
  climbId: FormDataEntryValue | null;
  sent: FormDataEntryValue | null;
  entryDate: FormDataEntryValue | null;
  body: FormDataEntryValue | null;
  tags: unknown;
};

export function normalizeTag(value: string): string {
  return value.toLowerCase().trim();
}

export function isValidJournalTag(value: string): boolean {
  return /^[a-z0-9-]+$/.test(value);
}

export function normalizeTags(raw: unknown): string[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new ActionError("Invalid tags");

  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string") throw new ActionError("Invalid tags");
    const tag = normalizeTag(value);
    if (!tag) continue;
    if (tag.length > MAX_JOURNAL_TAG_LENGTH) {
      throw new ActionError(
        `Tag "${tag}" is ${tag.length} characters — the limit is ${MAX_JOURNAL_TAG_LENGTH}`,
      );
    }
    if (!isValidJournalTag(tag)) {
      throw new ActionError(`Tag "${tag}" can only contain letters, numbers and hyphens`);
    }
    seen.add(tag);
  }

  if (seen.size > MAX_JOURNAL_TAGS) {
    throw new ActionError(`${seen.size} tags — the limit is ${MAX_JOURNAL_TAGS}`);
  }
  return [...seen];
}

function parseKind(value: unknown): JournalKind {
  if (typeof value !== "string" || !(JOURNAL_KINDS as readonly string[]).includes(value)) {
    throw new ActionError("Invalid entry kind");
  }
  return value as JournalKind;
}

export function parseJournalVisibility(value: unknown): JournalVisibility {
  if (typeof value !== "string" || !(JOURNAL_VISIBILITIES as readonly string[]).includes(value)) {
    throw new ActionError("Invalid journal visibility");
  }
  return value as JournalVisibility;
}

function parseClimbId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const climbId = Number(value);
  if (!Number.isInteger(climbId) || climbId < 1) throw new ActionError("Invalid climb");
  return climbId;
}

function parseEntryDate(value: unknown, today: string): string {
  const entryDate = typeof value === "string" ? value.trim() : "";
  if (!entryDate) throw new ActionError("Entry date is required");
  if (!isRealIsoDate(entryDate)) throw new ActionError("Invalid entry date");
  if (entryDate > latestAcceptableSendDate(today)) {
    throw new ActionError("Entry date can't be in the future");
  }
  return entryDate;
}

export function validateJournalInput(
  raw: RawJournalEntryInput,
  today: string = new Date().toISOString().slice(0, 10),
): JournalEntryInput {
  const kind = parseKind(raw.kind);
  const climbId = parseClimbId(raw.climbId);
  const sent = raw.sent === "true" || raw.sent === "on" || raw.sent === "1";
  const entryDate = parseEntryDate(raw.entryDate, today);
  const body = trimOrNull(typeof raw.body === "string" ? raw.body : null);
  const tags = normalizeTags(raw.tags);

  if (kind === "training") {
    if (climbId !== null) {
      throw new ActionError("Climb-specific entries are sessions, not training");
    }
    if (sent) throw new ActionError("Training entries can't be marked as sends");
    if (!body && tags.length === 0) {
      throw new ActionError("Add a note or a tag so this records something");
    }
  } else {
    if (climbId === null) throw new ActionError("Pick a climb for an outdoor session");
  }

  if (body && body.length > MAX_LOG_NOTE_LENGTH) {
    throw new ActionError(
      `Note is ${body.length} characters — the limit is ${MAX_LOG_NOTE_LENGTH.toLocaleString("en-US")}`,
    );
  }

  return { kind, climbId, sent, entryDate, body, tags: tags.length > 0 ? tags : null };
}
