"use client";

import { Button, useOverlayState } from "@heroui/react";
import { clsx } from "clsx";
import { X } from "lucide-react";
import { useMemo, useState } from "react";

import { AreaSearchField } from "@/components/area-search-field";
import { choicePillClass } from "@/components/ui/choice-pill";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Grade } from "@/components/ui/grade";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { ClimbCandidate } from "@/db/queries";
import { formatCount } from "@/lib/format";
import { formatGrade } from "@/lib/grades";
import {
  duplicateClimbRows,
  foldClimbName,
  summarizeResolved,
  type ManualChoice,
  type PreferredArea,
  type ResolvedRow,
  type ResolvedState,
  type ResolvedSummary,
} from "@/lib/import-matching";

import { ImportClimbSearchDrawer, type SearchTarget } from "./import-climb-search-drawer";

/** Where the climb-name lookup stands — the step renders its list only once
 * every name has been asked about. */
export type LookupStatus =
  | { phase: "loading"; done: number; total: number }
  | { phase: "done" }
  | { phase: "failed"; error: string };

export type Filter = ResolvedState | "all";

/** The bucket to open on: whatever has work in it. Chosen once, when the
 * lookup finishes, so the list doesn't jump as rows resolve. */
export function defaultFilter(summary: ResolvedSummary): Filter {
  return summary.attention > 0 ? "attention" : summary.review > 0 ? "review" : "all";
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "attention", label: "Needs attention" },
  { key: "review", label: "Check" },
  { key: "matched", label: "Matched" },
  { key: "picked", label: "Picked" },
  { key: "skipped", label: "Skipped" },
  { key: "all", label: "All rows" },
];

const STATE_CLASS: Record<ResolvedState, string> = {
  attention: "text-danger",
  review: "text-warning",
  matched: "text-success-soft-foreground",
  picked: "text-success-soft-foreground",
  skipped: "text-muted",
};

/** Rows listed per "show more" — the list is scanned, not paged, so this only
 * keeps a 5,000-row file from mounting 5,000 rows at once. */
const PAGE = 50;

function stateLabel(resolved: ResolvedRow): string {
  switch (resolved.state) {
    case "attention":
      return resolved.match.kind === "none" ? "Not found" : "Needs a pick";
    case "review":
      return "Check";
    case "matched":
      return "Matched";
    case "picked":
      return "Picked";
    case "skipped":
      return "Skipped";
    default:
      return "";
  }
}

/** The climbs "Change" offers before falling back to a search. */
function candidatesFor(resolved: ResolvedRow): ClimbCandidate[] {
  const { match, climb } = resolved;
  const known =
    match.kind === "exact"
      ? [match.climb]
      : match.kind === "inferred"
        ? [match.climb, ...match.alternatives]
        : match.kind === "ambiguous"
          ? match.pool
          : [];
  if (climb && !known.some((c) => c.id === climb.id)) return [climb, ...known];
  return known;
}

/** The ancestors nearest the climb, root-first. The continent and country
 * are what a full path leads with, and on a phone they are all that fits;
 * they are also the part that never tells two same-named climbs apart. */
function nearestAncestors(climb: ClimbCandidate, depth = 3): string {
  return climb.ancestors
    .slice(-depth)
    .map((area) => area.name)
    .join(" / ");
}

/** Where a climb is, as the rows below show it: its own area first, then
 * the nearest ancestors underneath, wrapping rather than truncating. The
 * climb's name is shown only when it differs from the CSV's, since every
 * candidate for a row shares that name. */
function ClimbPlace({ climb, rowClimbName }: { climb: ClimbCandidate; rowClimbName: string }) {
  const showName = foldClimbName(climb.name) !== foldClimbName(rowClimbName);
  return (
    <span className="min-w-0 wrap-break-word">
      {showName && <span className="block text-sm text-foreground">{climb.name}</span>}
      <span className="block text-sm text-foreground">{climb.areaName}</span>
      {climb.ancestors.length > 0 && (
        <span className="block text-xs text-muted">{nearestAncestors(climb)}</span>
      )}
    </span>
  );
}

function CandidateRow({
  climb,
  rowClimbName,
  current,
  onPick,
}: {
  climb: ClimbCandidate;
  rowClimbName: string;
  current: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={current}
      className={clsx(
        "flex w-full cursor-pointer items-center justify-between gap-3 rounded-inset px-3 py-2 text-left transition-colors hover:bg-surface/60 focus-visible:status-focused",
        current && "bg-surface",
      )}
    >
      <ClimbPlace climb={climb} rowClimbName={rowClimbName} />
      <span className="flex shrink-0 items-center gap-2">
        <span className="hidden text-xs text-muted sm:inline">
          {formatCount(climb.sendCount, "ascent")}
        </span>
        <DisciplineChip type={climb.type} />
        <Grade>{formatGrade(climb.type, climb.grade)}</Grade>
        {current && (
          <span className="text-xs font-medium text-success-soft-foreground">Current</span>
        )}
      </span>
    </button>
  );
}

function CandidateList({
  candidates,
  rowClimbName,
  currentId,
  onPick,
}: {
  candidates: ClimbCandidate[];
  rowClimbName: string;
  currentId: number | null;
  onPick: (climb: ClimbCandidate) => void;
}) {
  return (
    <div className="flex max-h-80 flex-col divide-y divide-separator overflow-y-auto rounded-surface border border-border">
      {candidates.map((climb) => (
        <CandidateRow
          key={climb.id}
          climb={climb}
          rowClimbName={rowClimbName}
          current={climb.id === currentId}
          onPick={() => onPick(climb)}
        />
      ))}
    </div>
  );
}

/** The chosen climb, the way a send row will show it. */
function ClimbLine({ climb, rowClimbName }: { climb: ClimbCandidate; rowClimbName: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-inset bg-surface px-3 py-2">
      <ClimbPlace climb={climb} rowClimbName={rowClimbName} />
      <span className="flex shrink-0 items-center gap-2">
        <DisciplineChip type={climb.type} />
        <Grade>{formatGrade(climb.type, climb.grade)}</Grade>
      </span>
    </div>
  );
}

// oxlint-disable-next-line complexity -- one branch per resolution state / badge, not decomposable
function MatchRow({
  resolved,
  duplicateOf,
  onChoose,
  onSearch,
}: {
  resolved: ResolvedRow;
  /** The earlier row that already resolved to this row's climb, if any. */
  duplicateOf: number | null;
  onChoose: (choice: ManualChoice | null) => void;
  onSearch: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { row, match, state, climb } = resolved;
  const candidates = candidatesFor(resolved);
  const [showPool, setShowPool] = useState(false);

  const facts = [
    row.gradeText ?? row.postedGradeText,
    row.dateSent,
    row.areaName,
    // A path hint is split leaf-first; two segments place the climb well
    // enough for a one-line summary.
    ...row.areaHints.slice(0, 2),
  ].filter((fact): fact is string => Boolean(fact));

  const pick = (chosen: ClimbCandidate) => {
    onChoose({ kind: "pick", climb: chosen });
    setExpanded(false);
  };

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {row.climbName}{" "}
            <span className="text-xs font-normal text-muted tabular-nums">
              Row {row.rowIndex + 1}
            </span>
          </p>
          {facts.length > 0 && <p className="truncate text-xs text-muted">{facts.join(" · ")}</p>}
        </div>
        <span className={clsx("shrink-0 text-xs font-medium", STATE_CLASS[state])}>
          {stateLabel(resolved)}
        </span>
      </div>

      {climb && (
        <>
          <ClimbLine climb={climb} rowClimbName={row.climbName} />
          {state === "review" && match.kind === "inferred" && (
            <p className="text-xs text-muted">
              Chosen from {formatCount(match.alternatives.length + 1, "climb")} with this name:{" "}
              {match.reason}.
            </p>
          )}
          {state === "review" && match.kind === "exact" && (
            <p className="text-xs text-muted">{match.notes.join(" · ")}</p>
          )}
          {duplicateOf != null && (
            <p className="text-xs text-warning">
              Same climb as row {duplicateOf + 1}. Only one will import.
            </p>
          )}
          {expanded && (
            <div className="flex flex-col gap-2">
              {candidates.length > 1 && (
                <CandidateList
                  candidates={candidates}
                  rowClimbName={row.climbName}
                  currentId={climb.id}
                  onPick={pick}
                />
              )}
              <div>
                <Button size="sm" variant="ghost" onPress={onSearch}>
                  Search for a different climb
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {state === "attention" && match.kind === "ambiguous" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">
            {match.conflict
              ? `${match.conflict}.`
              : `${match.total === 1 ? "1 climb has this name" : `${match.total} climbs share this name`}${
                  match.narrowedBy
                    ? `, narrowed by ${match.narrowedBy} to ${match.candidates.length}`
                    : ""
                }.`}
            {match.truncated &&
              ` Only the ${match.pool.length} most climbed are listed; search if yours isn't among them.`}
          </p>
          <CandidateList
            candidates={showPool ? match.pool : match.candidates}
            rowClimbName={row.climbName}
            currentId={null}
            onPick={pick}
          />
          {match.pool.length > match.candidates.length && (
            <button
              type="button"
              onClick={() => setShowPool((v) => !v)}
              className="self-start text-xs text-muted underline decoration-dotted underline-offset-4 hover:text-foreground"
            >
              {showPool
                ? "Show likely matches only"
                : `Show all ${match.pool.length} with this name`}
            </button>
          )}
        </div>
      )}

      {state === "attention" && match.kind === "none" && (
        <p className="text-xs text-muted">
          No climb named “{row.climbName}” in betabook. Search under a different spelling, or skip
          the row.
        </p>
      )}

      {state === "skipped" && <p className="text-xs text-muted">This row will be skipped.</p>}

      <div className="flex flex-wrap gap-2">
        {state === "skipped" ? (
          <Button size="sm" variant="ghost" onPress={() => onChoose(null)}>
            Undo skip
          </Button>
        ) : (
          <>
            {climb ? (
              <Button
                size="sm"
                variant="ghost"
                onPress={() => (candidates.length > 1 ? setExpanded((v) => !v) : onSearch())}
              >
                {expanded ? "Keep this one" : "Change"}
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onPress={onSearch}>
                Search
              </Button>
            )}
            <Button size="sm" variant="ghost" onPress={() => onChoose({ kind: "skip" })}>
              Skip row
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

/** The wizard's match step: each valid row against the climbs sharing its
 * name, grouped by how it resolved, with the tools to fix the rest (pick a
 * candidate, search, skip). "Your areas" resolves whole groups of ties at
 * once. */
export function ImportMatchStep({
  resolved,
  lookup,
  onRetryLookup,
  preferredAreas,
  onPreferredAreasChange,
  filter,
  onFilterChange,
  onChoose,
  onChooseMany,
}: {
  resolved: ResolvedRow[] | null;
  lookup: LookupStatus;
  onRetryLookup: () => void;
  preferredAreas: PreferredArea[];
  onPreferredAreasChange: (areas: PreferredArea[]) => void;
  /** Owned by the wizard, which sets it once per lookup (see defaultFilter)
   * and again when the review step sends the user back to a bucket. */
  filter: Filter | null;
  onFilterChange: (filter: Filter) => void;
  onChoose: (rowIndex: number, choice: ManualChoice | null) => void;
  /** Several choices in one state update, for "Skip all unresolved". */
  onChooseMany: (choices: { rowIndex: number; choice: ManualChoice | null }[]) => void;
}) {
  const summary = useMemo(() => (resolved ? summarizeResolved(resolved) : null), [resolved]);
  const duplicates = useMemo(
    () => (resolved ? duplicateClimbRows(resolved) : new Map()),
    [resolved],
  );
  const activeFilter: Filter = filter ?? "all";

  // How far the list is unrolled, remembered per filter so switching tabs
  // starts each at the top rather than wherever the last one was left.
  const [unrolled, setUnrolled] = useState<{ filter: Filter; count: number } | null>(null);
  const shown = unrolled?.filter === activeFilter ? unrolled.count : PAGE;

  const [areaQuery, setAreaQuery] = useState("");

  const searchState = useOverlayState();
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null);

  const visible = useMemo(
    () =>
      resolved
        ? activeFilter === "all"
          ? resolved
          : resolved.filter((r) => r.state === activeFilter)
        : [],
    [resolved, activeFilter],
  );

  function openSearch(r: ResolvedRow) {
    setSearchTarget({
      rowIndex: r.row.rowIndex,
      climbName: r.row.climbName,
      areaName: r.row.areaName,
    });
    searchState.open();
  }

  function skipAllUnresolved() {
    onChooseMany(
      (resolved ?? [])
        .filter((r) => r.state === "attention")
        .map((r) => ({ rowIndex: r.row.rowIndex, choice: { kind: "skip" as const } })),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">
        Each row is matched to a climb by name. When several climbs share a name, your areas, the
        file&apos;s location columns, and the grade break the tie. Rows that still don&apos;t
        resolve are listed under “Needs attention”, where you can pick a climb, search for one, or
        skip the row.
      </p>

      <section className="flex flex-col gap-2">
        <Eyebrow>Your areas</Eyebrow>
        <p className="text-xs text-muted">
          Areas this log is from. When climbs share a name, the one in these areas is chosen.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {preferredAreas.map((area) => (
            <button
              key={area.id}
              type="button"
              onClick={() => onPreferredAreasChange(preferredAreas.filter((a) => a.id !== area.id))}
              aria-label={`Remove ${area.name}`}
              className={`${choicePillClass(true, "bg-surface text-foreground")} inline-flex items-center gap-1`}
            >
              {area.name}
              <X className="size-3" aria-hidden />
            </button>
          ))}
          <AreaSearchField
            value={areaQuery}
            onChange={setAreaQuery}
            onSelect={(area) => {
              if (!preferredAreas.some((a) => a.id === area.id)) {
                onPreferredAreasChange([...preferredAreas, { id: area.id, name: area.name }]);
              }
              setAreaQuery("");
            }}
            ariaLabel="Add an area"
            placeholder="Add an area…"
            emptyMessage="No matching areas."
            className="w-full sm:w-64"
          />
        </div>
      </section>

      {lookup.phase === "loading" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            Looking up climb names… {lookup.done} / {lookup.total}
          </p>
          <ProgressBar value={lookup.done} max={lookup.total} />
        </div>
      )}

      {lookup.phase === "failed" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-danger">Couldn&apos;t look up climb names: {lookup.error}</p>
          <div>
            <Button variant="outline" onPress={onRetryLookup}>
              Try again
            </Button>
          </div>
        </div>
      )}

      {resolved && summary && (
        <>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter rows">
            {FILTERS.map(({ key, label }) => {
              const count = key === "all" ? resolved.length : summary[key];
              // An empty bucket is hidden, unless it's the one being looked
              // at: the tab must outlive its last row.
              if (count === 0 && key !== "all" && activeFilter !== key) return null;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={activeFilter === key}
                  onClick={() => onFilterChange(key)}
                  className={`${choicePillClass(activeFilter === key, "bg-surface text-foreground")} tabular-nums`}
                >
                  {label} · {count}
                </button>
              );
            })}
          </div>

          {activeFilter === "attention" && summary.attention > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                {formatCount(summary.attention, "row")} still need a climb. Unresolved rows are
                skipped at import.
              </p>
              <Button size="sm" variant="ghost" onPress={skipAllUnresolved}>
                Skip all unresolved
              </Button>
            </div>
          )}

          {visible.length === 0 ? (
            <EmptyState
              message={
                activeFilter === "attention" ? "Nothing needs attention." : "No rows in this group."
              }
            />
          ) : (
            <ul className="flex flex-col divide-y divide-separator">
              {visible.slice(0, shown).map((r) => (
                <MatchRow
                  key={r.row.rowIndex}
                  resolved={r}
                  duplicateOf={duplicates.get(r.row.rowIndex)?.rowIndex ?? null}
                  onChoose={(choice) => onChoose(r.row.rowIndex, choice)}
                  onSearch={() => openSearch(r)}
                />
              ))}
            </ul>
          )}
          {visible.length > shown && (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                onPress={() => setUnrolled({ filter: activeFilter, count: shown + PAGE })}
              >
                Show {Math.min(PAGE, visible.length - shown)} more
              </Button>
            </div>
          )}
        </>
      )}

      <ImportClimbSearchDrawer
        state={searchState}
        target={searchTarget}
        onPick={(rowIndex, climb) => onChoose(rowIndex, { kind: "pick", climb })}
      />
    </div>
  );
}
