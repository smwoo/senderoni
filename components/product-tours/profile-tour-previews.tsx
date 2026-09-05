"use client";

import { Button, SearchField } from "@heroui/react";
import { useState } from "react";

import { StatTiles } from "@/components/analytics-stat-tiles";
import { AscentStyle } from "@/components/ascent-style";
import { PrivacyFields } from "@/components/privacy-fields";
import { ProgressionChart } from "@/components/progression-chart";
import { SendGradeCell } from "@/components/send-grade-cell";
import { choicePillClass } from "@/components/ui/choice-pill";
import { ListRow } from "@/components/ui/list-row";
import { formatDate } from "@/lib/format-date";
import type { JournalVisibility } from "@/lib/journal";
import {
  getTourDemoJournalPage,
  TOUR_DEMO_ANALYTICS,
  TOUR_DEMO_ENTRIES,
  TOUR_DEMO_PROJECT,
  TOUR_DEMO_SENDS,
} from "@/lib/product-tour-demo";

function Choices<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          className={choicePillClass(value === option, "bg-foreground text-background")}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function DemoJournal() {
  const [view, setView] = useState<"All" | "Sessions" | "Training">("All");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { matches, visible } = getTourDemoJournalPage({
    kind: view === "All" ? null : view === "Sessions" ? "session" : "training",
    query,
    tag,
    showAll,
  });
  function toggleTag(next: string) {
    setTag(tag === next ? null : next);
    setShowAll(false);
  }
  return (
    <div className="flex flex-col gap-3">
      <div data-tour-target="journal-filters" className="flex flex-col gap-3">
        <SearchField
          aria-label="Search Alex's journal"
          value={query}
          onChange={(next) => {
            setQuery(next);
            setShowAll(false);
          }}
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search journal…" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <Choices
          label="Journal entry type"
          options={["All", "Sessions", "Training"]}
          value={view}
          onChange={(next) => {
            setView(next);
            setShowAll(false);
          }}
        />
      </div>
      {tag && (
        <button
          type="button"
          className="self-start text-xs underline focus-visible:status-focused"
          onClick={() => {
            setTag(null);
            setShowAll(false);
          }}
        >
          Clear #{tag} filter
        </button>
      )}
      <p role="status" className="text-xs text-muted">
        {view === "Training" && tag === "footwork" && matches.length === 1
          ? "One gym workout matches."
          : `Showing ${visible.length} of ${matches.length} matching entries`}
      </p>
      <div className="divide-y divide-border">
        {visible.map((entry) => (
          <ListRow
            key={entry.id}
            title={entry.climb?.name ?? "Training"}
            subtitle={`${entry.date} · ${entry.outcome}`}
            meta={entry.climb?.grade}
            comment={entry.note}
            tags={
              entry.tags.length > 0
                ? entry.tags.map((entryTag) => (
                    <button
                      key={entryTag}
                      type="button"
                      aria-pressed={tag === entryTag}
                      aria-label={`Filter example journal by ${entryTag}`}
                      onClick={() => toggleTag(entryTag)}
                      className={`cursor-pointer text-xs transition-colors hover:text-foreground focus-visible:status-focused ${tag === entryTag ? "font-medium text-foreground underline underline-offset-4" : "text-muted"}`}
                    >
                      #{entryTag}
                    </button>
                  ))
                : undefined
            }
          />
        ))}
      </div>
      {matches.length > 3 && (
        <Button
          variant="ghost"
          className="self-start"
          onPress={() => setShowAll(!showAll)}
          aria-expanded={showAll}
        >
          {showAll ? "Show fewer entries" : `Show all ${matches.length} entries`}
        </Button>
      )}
      {matches.length === 0 && (
        <p className="text-sm">
          No matching entries. Clear the search or turn off a filter to see more.
        </p>
      )}
    </div>
  );
}

export function DemoSends() {
  const [sort, setSort] = useState<"Date" | "Grade" | "Rating">("Date");
  const sends = [...TOUR_DEMO_SENDS].sort((a, b) => {
    if (sort === "Grade") return b.suggestedGrade - a.suggestedGrade;
    if (sort === "Rating") return b.rating - a.rating;
    return b.dateSent.localeCompare(a.dateSent);
  });
  return (
    <div className="flex flex-col gap-3">
      <div data-tour-target="send-sort">
        <Choices
          label="Sort sends"
          options={["Date", "Grade", "Rating"]}
          value={sort}
          onChange={setSort}
        />
      </div>
      <p role="status" className="text-xs text-muted">
        {sort === "Date"
          ? "Newest first"
          : `${sort === "Grade" ? "Hardest" : "Highest rated"} first`}
      </p>
      <div className="divide-y divide-border">
        {sends.map((send) => (
          <ListRow
            key={send.climbId}
            title={send.climbName}
            subtitle={send.areaName}
            comment={send.note}
            trailing={
              <div className="flex flex-col items-end gap-1 text-sm">
                <SendGradeCell
                  type={send.climbType}
                  grade={send.suggestedGrade}
                  gradeFeel="solid"
                  rating={send.rating}
                />
                <AscentStyle type={send.ascentStyle} />
                <time dateTime={send.dateSent} className="text-xs text-muted">
                  {formatDate(send.dateSent)}
                </time>
              </div>
            }
          />
        ))}
      </div>
    </div>
  );
}

export function DemoProjects() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <ListRow
        title={TOUR_DEMO_PROJECT.name}
        meta={TOUR_DEMO_PROJECT.grade}
        subtitle={`${TOUR_DEMO_PROJECT.sessions.length} sessions · Last: March 14`}
      />
      <div data-tour-target="project-sessions" className="self-start">
        <Button
          variant="secondary"
          aria-expanded={expanded}
          aria-controls="demo-project-sessions"
          onPress={() => setExpanded(!expanded)}
        >
          {expanded ? "Hide sessions" : "See Alex's sessions"}
        </Button>
      </div>
      <div id="demo-project-sessions" hidden={!expanded} className="divide-y divide-border">
        {TOUR_DEMO_PROJECT.sessions.map((entry) => (
          <ListRow key={entry.id} title={entry.date} comment={entry.note} />
        ))}
      </div>
    </div>
  );
}

export function DemoAnalytics() {
  const [showDay, setShowDay] = useState(false);
  const analytics = TOUR_DEMO_ANALYTICS;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <StatTiles
        className="grid-cols-3"
        tiles={[
          { label: "Sends", value: analytics.sendCount },
          { label: "Days out", value: analytics.daysOut },
          { label: "Hardest", value: analytics.hardest[0].label },
        ]}
      />
      <div data-tour-target="analytics-chart">
        <h3 className="mb-2 text-sm font-medium">Boulder progression</h3>
        <ProgressionChart type="boulder" points={analytics.progression[0].points} />
      </div>
      <Button
        variant="secondary"
        aria-expanded={showDay}
        aria-controls="demo-analytics-day"
        onPress={() => setShowDay(!showDay)}
      >
        {showDay ? "Hide March 12" : "Why is March 12 only one day out?"}
      </Button>
      <div id="demo-analytics-day" hidden={!showDay}>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {TOUR_DEMO_ENTRIES.filter((entry) => entry.date === "2026-03-12").map((entry) => (
            <li key={entry.id}>
              {entry.climb?.name} · {entry.outcome}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">Three climbs on March 12 count as one day out.</p>
      </div>
    </div>
  );
}

export function DemoAccount() {
  const [isPrivate, setIsPrivate] = useState(false);
  const [journalVisibility, setJournalVisibility] = useState<JournalVisibility>("private");
  return (
    <div className="flex flex-col gap-4">
      <div data-tour-target="privacy-controls" className="flex flex-col gap-4">
        <PrivacyFields
          isPrivate={isPrivate}
          journalVisibility={journalVisibility}
          onProfileChange={setIsPrivate}
          onJournalChange={setJournalVisibility}
        />
      </div>
      <div role="status" className="rounded-lg bg-surface-secondary p-4 text-sm">
        <p className="font-medium">What a visitor can see</p>
        <p className="mt-1">
          {isPrivate
            ? "Alex's profile, sends, journal, and analytics are hidden."
            : `Alex's sends are public. Journal entries and send notes are ${journalVisibility === "private" ? "visible only to Alex" : journalVisibility === "public" ? "public" : "visible to friends"}.`}
        </p>
      </div>
    </div>
  );
}
