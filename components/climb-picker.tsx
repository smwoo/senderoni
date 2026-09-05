"use client";

import { clsx } from "clsx";
import { useState } from "react";

import { AreaSearchField } from "@/components/area-search-field";
import { DisciplineChips } from "@/components/discipline-chips";
import { AppLink } from "@/components/ui/app-link";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { FIELD_CLASS } from "@/components/ui/field";
import { Grade } from "@/components/ui/grade";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import type { AreaBreadcrumbs, ClimbWithAreaName, Discipline } from "@/db/queries";
import { useClimbSearch } from "@/hooks/use-climb-search";
import { formatCount } from "@/lib/format";
import { formatGrade } from "@/lib/grades";

/** Use plain text breadcrumbs because links cannot nest inside a result button. */
function areaPath(climb: ClimbWithAreaName, areaBreadcrumbs: AreaBreadcrumbs): string {
  return [...(areaBreadcrumbs[climb.areaId] ?? []).map((a) => a.name), climb.areaName].join(" / ");
}

function ClimbRow({
  climb,
  path,
  sendCount,
  sent,
  allowSentClimbs,
  pickable,
  onPick,
}: {
  climb: ClimbWithAreaName;
  path: string;
  sendCount: number;
  sent: boolean;
  allowSentClimbs: boolean;
  pickable: boolean;
  onPick: () => void;
}) {
  const detail = (
    <>
      <span className="min-w-0 text-left">
        <span className="block truncate text-sm text-foreground">{climb.name}</span>
        <span className="block truncate text-xs text-muted">{path}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="hidden text-xs text-muted sm:inline">
          {formatCount(sendCount, "ascent")}
        </span>
        <DisciplineChip type={climb.type} />
        <Grade>{formatGrade(climb.type, climb.grade)}</Grade>
      </span>
    </>
  );

  if (sent && !allowSentClimbs) {
    return (
      <div
        aria-disabled
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 opacity-60"
      >
        {detail}
        <span className="shrink-0 text-xs font-medium text-success-soft-foreground">Logged</span>
      </div>
    );
  }

  if (!pickable) {
    return (
      <div aria-disabled className="flex w-full items-center justify-between gap-3 px-3 py-2.5">
        {detail}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-inset px-3 py-2.5 text-left transition-colors hover:bg-surface-secondary/60 focus-visible:status-focused"
    >
      {detail}
      {sent && (
        <span className="shrink-0 text-xs font-medium text-success-soft-foreground">Logged</span>
      )}
    </button>
  );
}

/** Only one selected discipline can seed a new climb's type. */
function newClimbParams(name: string, areaName: string, disciplines: Discipline[]): string {
  const params = new URLSearchParams();
  if (name.trim()) params.set("name", name.trim());
  if (areaName.trim()) params.set("areaName", areaName.trim());
  if (disciplines.length === 1) params.set("type", disciplines[0]);
  return params.toString();
}

function resultSummary(matchCount: number, loaded: number): string {
  const matches = formatCount(matchCount, "match", "matches");
  if (matchCount <= loaded) return matches;
  return `${matches} — showing the first ${loaded}. Narrow by area if yours isn't here.`;
}

/** Select a concrete climb ID from paginated results; free text cannot identify the send's climb. */
export function ClimbPicker({
  onPick,
  sentClimbIds,
  allowSentClimbs = false,
  initialName = "",
  initialAreaName = "",
}: {
  /** Carry breadcrumbs and send counts for callers that keep a described selection. */
  onPick: (
    climb: ClimbWithAreaName,
    context: { ancestors: { id: number; name: string }[]; sendCount: number; sent: boolean },
  ) => void;
  /** Logged climbs are disabled unless allowSentClimbs is set. */
  sentClimbIds?: Set<number>;
  allowSentClimbs?: boolean;
  initialName?: string;
  initialAreaName?: string;
}) {
  const [name, setName] = useState(initialName);
  const [areaName, setAreaName] = useState(initialAreaName);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const { pages, matchCount, status, loadingMore, loadMoreFailed, loadMore } = useClimbSearch({
    name,
    areaName,
    disciplines,
  });

  const current = status === "answered";

  const message = {
    idle: "Pick a discipline, or search by route or area name.",
    searching: "Searching…",
    failed: "Search failed — edit the search to try again.",
    answered: pages ? resultSummary(matchCount, pages.climbs.length) : "",
  }[status];

  return (
    <div className="flex flex-col gap-4">
      {/* Sticky against the drawer body's own scroll (see .drawer__body) — a
       * search box that scrolls away is gone exactly when the list is long
       * enough to need narrowing.
       *
       * Pinned a few px ABOVE top-0, with the same amount padded back on:
       * .drawer__body carries 3px of padding (room for focus rings), and a
       * scroll container clips at its padding box, not its content box — so
       * at top-0 rows stay visible scrolling through that strip above the
       * header. Overshooting covers it; the extra is background, not text. */}
      <div className="sticky -top-1 z-10 flex flex-col gap-3 bg-overlay pt-1 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Eyebrow>Which climb?</Eyebrow>
          {/* Discipline first, and the same chips the list toolbars use: it's
           * the cheapest cut available — one tap drops a name search by
           * roughly two thirds — and it's the one thing you always know
           * about a climb you just did, even when you're unsure of the
           * spelling. Narrows on its own too, with no text at all. */}
          <DisciplineChips value={disciplines} onChange={setDisciplines} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Plain text, not RouteSearchField: the list below is already the
           * suggestion surface, and a popover would cover it. Bare input, no
           * TextField wrapper — HeroUI wires its label to its own <Input>,
           * not to a raw one, so the name has to come from aria-label. */}
          <input
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- modal search input focuses on mount
            autoFocus
            aria-label="Route name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Route name…"
            className={`${FIELD_CLASS} w-full search-combo-input`}
          />
          <AreaSearchField
            value={areaName}
            onChange={setAreaName}
            onSelect={(area) => setAreaName(area.name)}
            ariaLabel="Narrow by area"
            placeholder="In area (optional)"
            emptyMessage="No matching areas — the text still narrows by area name."
            fullWidth
          />
        </div>
        <p role="status" aria-live="polite" className="text-xs text-muted">
          {message}
        </p>
      </div>

      {status === "answered" && pages?.climbs.length === 0 && (
        <EmptyState
          message="No climbs match that search."
          cta={
            <AppLink
              href={`/climbs/new?${newClimbParams(name, areaName, disciplines)}`}
              className="text-sm"
            >
              Add the climb
            </AppLink>
          }
        />
      )}

      {pages != null &&
        pages.climbs.length > 0 && (
          // Keep stale results inert until the current query is answered.
          <div className={clsx("flex flex-col gap-3", !current && "opacity-50")}>
            <div className="flex flex-col divide-y divide-separator">
              {pages.climbs.map((climb) => (
                <ClimbRow
                  key={climb.id}
                  climb={climb}
                  path={areaPath(climb, pages.areaBreadcrumbs)}
                  sendCount={pages.sendStats[climb.id]?.sendCount ?? 0}
                  sent={
                    (pages.sentClimbIds?.has(climb.id) ?? false) ||
                    (sentClimbIds?.has(climb.id) ?? false)
                  }
                  allowSentClimbs={allowSentClimbs}
                  pickable={current}
                  onPick={() => {
                    const sent =
                      (pages.sentClimbIds?.has(climb.id) ?? false) ||
                      (sentClimbIds?.has(climb.id) ?? false);
                    onPick(climb, {
                      ancestors: pages.areaBreadcrumbs[climb.areaId] ?? [],
                      sendCount: pages.sendStats[climb.id]?.sendCount ?? 0,
                      sent,
                    });
                  }}
                />
              ))}
            </div>
            {current && pages.hasNextPage && (
              <LoadMoreButton onPress={loadMore} loading={loadingMore} failed={loadMoreFailed} />
            )}
          </div>
        )}
    </div>
  );
}
