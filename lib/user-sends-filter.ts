import type { UserSendsFilter, UserSendsSort } from "@/db/queries";
import { MAX_RATING } from "@/lib/climb-stats-filter";
import {
  DEFAULT_DISCIPLINE_FILTER,
  appendDisciplineFilterParams,
  parseDisciplineFilter,
} from "@/lib/discipline-filter";
import { parseAscentStyles, toArray, type SearchParamsRecord } from "@/lib/search-params";
import { isRealIsoDate } from "@/lib/sends";

const USER_SENDS_SORTS = new Set<UserSendsSort>([
  "date_desc",
  "date_asc",
  "grade_desc",
  "grade_asc",
  "rating_desc",
  "rating_asc",
]);

// No disciplines checked means "don't filter on discipline or grade at
// all" — not "match nothing". Checking one activates that filter (and
// reveals its grade-range dropdowns when the panel is expanded). Same
// convention for ascentStyles (empty = unfiltered) and minRating (0 = "Any").
export const DEFAULT_USER_SENDS_FILTER: UserSendsFilter = {
  ...DEFAULT_DISCIPLINE_FILTER,
  sort: "date_desc",
  ascentStyles: [],
  minRating: 0,
};

/** No `discipline` params means no disciplines are checked — an unfiltered
 * view, not "match nothing" (see DEFAULT_USER_SENDS_FILTER). */
export function parseUserSendsFilter(params: SearchParamsRecord): UserSendsFilter {
  const rawSort = toArray(params.sort)[0];
  const sort = USER_SENDS_SORTS.has(rawSort as UserSendsSort)
    ? (rawSort as UserSendsSort)
    : DEFAULT_USER_SENDS_FILTER.sort;

  const minRating = Number(toArray(params.minRating)[0]);
  const date = toArray(params.date)[0];

  return {
    ...(date && isRealIsoDate(date) ? { date } : {}),
    ...parseDisciplineFilter(params),
    name: toArray(params.name)[0],
    areaName: toArray(params.areaName)[0],
    sort,
    ascentStyles: parseAscentStyles(params),
    minRating:
      Number.isFinite(minRating) && minRating >= 0 && minRating <= MAX_RATING
        ? minRating
        : DEFAULT_USER_SENDS_FILTER.minRating,
  };
}

export function userSendsFilterToSearchParams(filter: UserSendsFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.date) params.set("date", filter.date);
  appendDisciplineFilterParams(params, filter);
  if (filter.name) params.set("name", filter.name);
  if (filter.areaName) params.set("areaName", filter.areaName);
  params.set("sort", filter.sort ?? "date_desc");
  for (const style of filter.ascentStyles) {
    params.append("ascentStyle", style);
  }
  if (filter.minRating) params.set("minRating", String(filter.minRating));
  return params;
}
