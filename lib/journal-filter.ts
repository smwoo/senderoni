import { isValidJournalTag, normalizeTag } from "@/lib/journal";
import { toArray, type SearchParamsRecord } from "@/lib/search-params";
import { isRealIsoDate } from "@/lib/sends";

export const JOURNAL_VIEWS = ["all", "sessions", "training"] as const;
export type JournalView = (typeof JOURNAL_VIEWS)[number];

export type JournalFilter = {
  date?: string;
  view: JournalView;
  query: string | null;
  tag: string | null;
  climbId: number | null;
  year: number | null;
};

export const DEFAULT_JOURNAL_FILTER: JournalFilter = {
  view: "all",
  query: null,
  tag: null,
  climbId: null,
  year: null,
};

export const MAX_JOURNAL_QUERY_LENGTH = 100;
const MIN_JOURNAL_YEAR = 1900;
const MAX_JOURNAL_YEAR = 2200;

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_JOURNAL_QUERY_LENGTH);
}

export function parseJournalFilter(params: SearchParamsRecord): JournalFilter {
  const rawView = toArray(params.view)[0];
  const view = (JOURNAL_VIEWS as readonly string[]).includes(rawView)
    ? (rawView as JournalView)
    : DEFAULT_JOURNAL_FILTER.view;

  const query = normalizeQuery(toArray(params.q)[0] ?? "");
  const normalizedTag = normalizeTag(toArray(params.tag)[0] ?? "");
  const tag = isValidJournalTag(normalizedTag) ? normalizedTag : "";

  const climbId = Number(toArray(params.climbId)[0]);
  const year = Number(toArray(params.year)[0]);
  const date = toArray(params.date)[0];

  return {
    ...(date && isRealIsoDate(date) ? { date } : {}),
    view,
    query: query || null,
    tag: tag || null,
    climbId: Number.isInteger(climbId) && climbId > 0 ? climbId : null,
    year:
      Number.isInteger(year) && year >= MIN_JOURNAL_YEAR && year <= MAX_JOURNAL_YEAR ? year : null,
  };
}

export function journalFilterToSearchParams(filter: JournalFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.date) params.set("date", filter.date);
  if (filter.view !== DEFAULT_JOURNAL_FILTER.view) params.set("view", filter.view);
  if (filter.query) params.set("q", filter.query);
  if (filter.tag) params.set("tag", filter.tag);
  if (filter.climbId) params.set("climbId", String(filter.climbId));
  if (filter.year) params.set("year", String(filter.year));
  return params;
}
