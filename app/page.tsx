import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ClimberList } from "@/components/climber-list";
import { ClimberSearchForm } from "@/components/climber-search-form";
import {
  NavigationPendingProvider,
  NavigationPendingRegion,
} from "@/components/navigation-pending";
import { AreaSearchToolbar, ClimbSearchToolbar } from "@/components/search-form";
import { SearchModeSwitch } from "@/components/search-mode-switch";
import { AreaSearchResults, ClimbSearchResults } from "@/components/search-results";
import { AppLink } from "@/components/ui/app-link";
import { SectionHeading } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import {
  countSearchAreas,
  countSearchClimbs,
  getAreaBreadcrumbs,
  getClimbSendStats,
  getClimbersPage,
  getUserSentClimbIds,
  searchAreas,
  searchClimbs,
} from "@/db/queries";
import {
  climbSearchFilterToSearchParams,
  DEFAULT_CLIMB_SEARCH_FILTER,
  parseClimbSearchFilter,
  parseClimbSearchSort,
  toSearchClimbsQueryParams,
} from "@/lib/climb-search-filter";
import type { SearchParamsRecord } from "@/lib/search-params";
import { getSession } from "@/lib/session";

type SearchPageProps = {
  searchParams: Promise<SearchParamsRecord>;
};

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  // Any param at all is a search/filter state (see the page body) — infinite
  // and low-value as a landing page, so it's kept out of the index and
  // canonicalized to the bare, unfiltered search page.
  const isSearch = Object.keys(await searchParams).length > 0;
  return isSearch
    ? { title: "Search", robots: { index: false }, alternates: { canonical: "/" } }
    : { alternates: { canonical: "/" } };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const isBare = Object.keys(params).length === 0;

  // Bare `/` used to be a "recent sends" feed; it's now the same search view
  // as every other state of this page (climb mode, unfiltered), so a signed-
  // out visitor lands directly on search instead of a feed. A signed-in
  // visitor still gets their own page — that's the one thing bare `/` still
  // special-cases.
  const bareSession = isBare ? await getSession() : null;
  if (isBare && bareSession) {
    redirect(`/users/${bareSession.user.id}`);
  }

  const db = await getDb();
  const mode = params.mode === "area" ? "area" : params.mode === "climber" ? "climber" : "climb";

  if (mode === "climber") return <ClimberSearchView rawName={params.name} />;

  if (mode === "area") {
    const name = typeof params.name === "string" ? params.name : "";
    // Only the first page is server-rendered — AreaSearchResults fetches
    // subsequent pages itself via "load more" (see app/api/search/areas).
    const [results, totalCount] = name
      ? await Promise.all([searchAreas(db, name), countSearchAreas(db, name)])
      : [{ areas: [], hasNextPage: false }, 0];
    const areaBreadcrumbs = await getAreaBreadcrumbs(
      db,
      results.areas.map((a) => a.id),
    );

    const currentSearch = new URLSearchParams({ mode: "area" });
    if (name) currentSearch.set("name", name);

    return (
      <NavigationPendingProvider>
        <div className="flex flex-col gap-6">
          {/* The page's content starts straight at the search controls — the
           * h1 exists for the document outline/assistive tech, not the eye. */}
          <h1 className="sr-only">Search areas</h1>
          <ModeSwitch mode={mode} name={name} currentSearch={currentSearch.toString()} />
          <section className="flex flex-col gap-3">
            <SectionHeading>
              Results
              {name && <ResultCount count={totalCount} />}
            </SectionHeading>
            <AreaSearchToolbar defaultName={name} />
            <NavigationPendingRegion>
              <AreaSearchResults
                key={name}
                name={name}
                initialAreas={results.areas}
                initialHasNextPage={results.hasNextPage}
                initialAreaBreadcrumbs={areaBreadcrumbs}
                emptyMessage={name ? `No areas matching "${name}".` : "Search for an area by name."}
              />
            </NavigationPendingRegion>
          </section>
        </div>
      </NavigationPendingProvider>
    );
  }

  const sort = parseClimbSearchSort(params);
  const filter = parseClimbSearchFilter(params);

  // No disciplines checked means the discipline/grade filter isn't active —
  // searchClimbs already matches everything when `disciplines` is empty.
  // Only the first page is server-rendered — ClimbSearchResults fetches
  // subsequent pages itself via "load more" (see app/api/search/climbs).
  // The searches and the session lookup don't depend on each other.
  //
  // Counting only happens once something is actually filtered: the default
  // landing would otherwise COUNT(*) every climb (a full index scan billed
  // on every visit) just to caption an unfiltered list. Canonical
  // serialization is the comparison the filter libs already treat as
  // identity (see their fixed-point tests); sort cancels out.
  const searchActive =
    climbSearchFilterToSearchParams(sort, filter).toString() !==
    climbSearchFilterToSearchParams(sort, DEFAULT_CLIMB_SEARCH_FILTER).toString();
  const queryParams = toSearchClimbsQueryParams(filter, sort);
  // Bare `/` already resolved the session above (to decide the redirect,
  // where it's always null by this point) — reuse it instead of a second
  // getSession() round trip on the highest-traffic anonymous page.
  const [results, totalCount, session] = await Promise.all([
    searchClimbs(db, queryParams),
    searchActive ? countSearchClimbs(db, queryParams) : null,
    isBare ? bareSession : getSession(),
  ]);
  const [sendStats, areaBreadcrumbs, sentClimbIds] = await Promise.all([
    getClimbSendStats(
      db,
      results.climbs.map((c) => c.id),
    ),
    getAreaBreadcrumbs(
      db,
      results.climbs.map((c) => c.areaId),
    ),
    session
      ? getUserSentClimbIds(
          db,
          session.user.id,
          results.climbs.map((climb) => climb.id),
        )
      : Promise.resolve(undefined),
  ]);

  return (
    <NavigationPendingProvider>
      <div className="flex flex-col gap-6">
        {/* See the area-mode h1 above — visually the page starts at the
         * search controls. */}
        <h1 className="sr-only">Search climbs</h1>
        <ModeSwitch
          mode={mode}
          name={filter.name}
          currentSearch={climbSearchFilterToSearchParams(sort, filter).toString()}
        />
        <section className="flex flex-col gap-3">
          <SectionHeading>
            Results
            {totalCount != null && <ResultCount count={totalCount} />}
          </SectionHeading>
          <ClimbSearchToolbar filter={filter} sort={sort} />
          <NavigationPendingRegion>
            <ClimbSearchResults
              key={climbSearchFilterToSearchParams(sort, filter).toString()}
              sort={sort}
              filter={filter}
              initialClimbs={results.climbs}
              initialHasNextPage={results.hasNextPage}
              initialSendStats={sendStats}
              initialAreaBreadcrumbs={areaBreadcrumbs}
              sentClimbIds={sentClimbIds}
            />
          </NavigationPendingRegion>
        </section>
      </div>
    </NavigationPendingProvider>
  );
}

/** The match total shown next to the "Results" heading — an exact COUNT(*)
 * computed alongside the first page's query (see countSearchClimbs), so
 * "load more" is visibly worth pressing instead of results silently capping. */
function ResultCount({ count }: { count: number }) {
  return (
    <span className="ml-1.5 text-sm font-normal text-muted">({count.toLocaleString("en-US")})</span>
  );
}

function ModeSwitch({
  mode,
  name,
  currentSearch,
}: {
  mode: "area" | "climb" | "climber";
  /** The typed name — the one search param both modes understand, so it
   * carries across a mode switch. */
  name?: string;
  /** The active mode's full current query string, so the active pill links
   * to exactly where the user already is (keeping sort/filters) instead of
   * resetting them. */
  currentSearch: string;
}) {
  function hrefFor(target: "area" | "climb" | "climber"): string {
    if (target === mode) return `/?${currentSearch}`;
    // Cross-mode: the name transfers, everything else is mode-specific
    // (sort, disciplines, grade/rating ranges) and resets to defaults.
    const params = new URLSearchParams({ mode: target });
    if (name) params.set("name", name);
    return `/?${params.toString()}`;
  }

  return <SearchModeSwitch mode={mode} hrefFor={hrefFor} />;
}

async function ClimberSearchView({ rawName }: { rawName: SearchParamsRecord[string] }) {
  const name = typeof rawName === "string" ? rawName.trim().slice(0, 100) : "";
  const mode = "climber";
  const db = await getDb();
  const session = await getSession();
  const page = await getClimbersPage(db, session?.user.id ?? null, { name });
  const currentSearch = new URLSearchParams({ mode, name });
  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Search climbers</h1>
      <ModeSwitch mode={mode} name={name} currentSearch={currentSearch.toString()} />
      <p className="text-sm text-muted">
        Search by name to find a climbing partner and send a friend request.
      </p>
      <ClimberSearchForm key={name} name={name} />
      {session && <AppLink href="/feed">View your feed</AppLink>}
      <ClimberList
        viewerId={session?.user.id ?? null}
        key={`${session?.user.id ?? "anonymous"}:${name}`}
        initialPage={page}
        name={name}
        signedIn={!!session}
      />
    </div>
  );
}
