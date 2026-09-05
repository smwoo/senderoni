import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader, getUserById } from "@/app/users/[id]/profile-shell";
import { AnalyticsGradePyramid } from "@/components/analytics-grade-pyramid";
import { StatTiles, type StatTile } from "@/components/analytics-stat-tiles";
import { AnalyticsYearSelect } from "@/components/analytics-year-select";
import { BreakthroughList } from "@/components/breakthrough-list";
import { ClimbingCalendar } from "@/components/climbing-calendar";
import { ProgressionChart } from "@/components/progression-chart";
import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import { choicePillClass } from "@/components/ui/choice-pill";
import {
  DISCIPLINE_CHIP_CLASSNAME,
  DISCIPLINE_HUE,
  DISCIPLINE_LABELS,
} from "@/components/ui/discipline-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { getDb } from "@/db/client";
import { getJournalSessionsForAnalytics, getUserSendsForAnalytics } from "@/db/queries";
import { canReadJournal } from "@/db/queries/journal-access";
import { formatCount } from "@/lib/format";
import type { ClimbType } from "@/lib/grades";
import type { SearchParamsRecord } from "@/lib/search-params";
import { getSession } from "@/lib/session";
import {
  buildPyramid,
  buildUserAnalytics,
  DISCIPLINE_ORDER,
  formatDaySpan,
  formatMonthLabel,
  parseDisciplineScope,
} from "@/lib/user-analytics";
import { canViewUser } from "@/lib/user-visibility";

type UserAnalyticsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParamsRecord>;
};

export async function generateMetadata({ params }: UserAnalyticsPageProps): Promise<Metadata> {
  const { id } = await params;
  const [user, session] = await Promise.all([getUserById(id), getSession()]);
  if (!user || !canViewUser(user, session?.user.id ?? null)) notFound();

  return { title: `${user.name} · Analytics`, robots: { index: false } };
}

function analyticsHref(userId: string, scope: ClimbType): string {
  return `/users/${userId}/analytics?discipline=${scope}`;
}

// oxlint-disable-next-line complexity -- assembles many independent page sections from search params
export default async function UserAnalyticsPage({ params, searchParams }: UserAnalyticsPageProps) {
  const [{ id }, search] = await Promise.all([params, searchParams]);

  const [db, user, session] = await Promise.all([getDb(), getUserById(id), getSession()]);
  if (!user) notFound();
  const viewerId = session?.user.id ?? null;
  if (!canViewUser(user, viewerId)) notFound();

  const journalVisible = await canReadJournal(db, user.id, viewerId);
  const [rows, journalSessions] = await Promise.all([
    getUserSendsForAnalytics(db, id),
    journalVisible
      ? getJournalSessionsForAnalytics(db, user.id, viewerId)
      : Promise.resolve(undefined),
  ]);

  // Grades only compare within one discipline, so the whole page is always
  // scoped to one — the chips only offer disciplines this climber has
  // actually logged, and the default is their most-logged.
  const present = DISCIPLINE_ORDER.filter(
    (type) =>
      rows.some((row) => row.climbType === type) ||
      journalSessions?.some((entry) => entry.climbType === type),
  );
  const disciplineVolume = (type: ClimbType) =>
    journalSessions
      ? journalSessions
          .filter((entry) => entry.climbType === type)
          .reduce((total, entry) => total + entry.count, 0)
      : rows.filter((entry) => entry.climbType === type).length;
  const dominant = [...present].sort((a, b) => disciplineVolume(b) - disciplineVolume(a))[0];
  const requested = parseDisciplineScope(
    typeof search.discipline === "string" ? search.discipline : undefined,
  );
  const scope = requested !== "all" && present.includes(requested) ? requested : (dominant ?? null);

  if (scope == null) {
    return (
      <div className="flex flex-col gap-6">
        <ProfileHeader user={user} viewerId={session?.user.id ?? null} />
        <EmptyState message="No outdoor sessions logged yet — analytics appear with the first session." />
      </div>
    );
  }

  const analytics = buildUserAnalytics(rows, scope, journalSessions);
  const hue = DISCIPLINE_HUE[scope];

  const requestedYear = Number(typeof search.year === "string" ? search.year : Number.NaN);
  const year = analytics.calendarYears.includes(requestedYear)
    ? requestedYear
    : (analytics.calendarYears.at(-1) ?? null);

  // The pyramid has its own year selector — null means all time.
  const requestedPyramidYear = Number(
    typeof search.pyramid === "string" ? search.pyramid : Number.NaN,
  );
  const pyramidYear = analytics.years.includes(requestedPyramidYear) ? requestedPyramidYear : null;
  const pyramidRows =
    pyramidYear == null
      ? (analytics.pyramid[0]?.rows ?? [])
      : buildPyramid(
          rows.filter(
            (row) =>
              row.climbType === scope && row.dateSent?.startsWith(`${pyramidYear}-`) === true,
          ),
          scope,
        );

  const hardest = analytics.hardest[0] ?? null;
  const firstTryCount = analytics.flashCount + analytics.onsightCount;
  const tiles: StatTile[] = [
    {
      label: "Sends",
      value: analytics.sendCount,
      sub: analytics.dateSpan
        ? `${formatMonthLabel(analytics.dateSpan[0].slice(0, 7))} – ${formatMonthLabel(analytics.dateSpan[1].slice(0, 7))}`
        : "no dated sends",
    },
    {
      label: "Hardest",
      value: hardest?.label ?? "—",
      sub: hardest ? hardest.climbName : "no graded sends",
    },
    {
      label: "First try",
      value:
        analytics.sendCount === 0
          ? "—"
          : `${Math.round((firstTryCount / analytics.sendCount) * 100)}%`,
      sub:
        analytics.sendCount === 0
          ? "no sends yet"
          : analytics.hardestFirstTry
            ? `Hardest: ${analytics.hardestFirstTry.label}`
            : `${analytics.flashCount} flash · ${analytics.onsightCount} onsight`,
    },
    {
      label: journalVisible ? "Days out" : "Sending days",
      value: analytics.daysOut,
      sub: analytics.daysPerMonth != null ? `${analytics.daysPerMonth.toFixed(1)} per month` : null,
    },
    {
      label: "Best year",
      value: analytics.bestYear?.year ?? "—",
      sub: analytics.bestYear ? formatCount(analytics.bestYear.count, "send") : null,
    },
    {
      label: "Areas",
      value: analytics.areaCount,
      sub: analytics.topArea ? `Most sends: ${analytics.topArea.name}` : null,
    },
  ];

  const consistencyTiles: StatTile[] = [
    ...(analytics.longestStreak
      ? [
          {
            label: journalVisible ? "Longest streak" : "Longest send streak",
            value: formatCount(analytics.longestStreak.days, "day"),
            sub: formatMonthLabel(analytics.longestStreak.end.slice(0, 7)),
          },
        ]
      : []),
    ...(analytics.longestLayoff
      ? [
          {
            label: journalVisible ? "Longest layoff" : "Longest send gap",
            value: formatDaySpan(analytics.longestLayoff.days),
            sub: `${formatMonthLabel(analytics.longestLayoff.from.slice(0, 7))} – ${formatMonthLabel(analytics.longestLayoff.to.slice(0, 7))}`,
          },
        ]
      : []),
    ...(analytics.busiestMonth
      ? [
          {
            label: "Busiest month",
            value: formatMonthLabel(analytics.busiestMonth.month),
            sub: formatCount(analytics.busiestMonth.count, "send"),
          },
        ]
      : []),
    ...(analytics.favoriteWeekday
      ? [
          {
            label: "Favorite day",
            value: analytics.favoriteWeekday.weekday,
            sub: formatCount(analytics.favoriteWeekday.count, "send"),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <ProfileHeader user={user} viewerId={session?.user.id ?? null} />

      {present.length > 1 && (
        <nav aria-label="Discipline" className="flex flex-wrap gap-2">
          {present.map((type) => {
            const selected = type === scope;
            return (
              <AppLink
                key={type}
                href={analyticsHref(id, type)}
                aria-current={selected ? "true" : undefined}
                className={choicePillClass(selected, DISCIPLINE_CHIP_CLASSNAME[type])}
              >
                {DISCIPLINE_LABELS[type]}
              </AppLink>
            );
          })}
        </nav>
      )}

      <div>
        <StatTiles tiles={tiles} className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6" />
        {analytics.datelessCount > 0 && (
          <p className="mt-2 text-xs text-muted">
            {formatCount(analytics.datelessCount, "send")}{" "}
            {analytics.datelessCount === 1 ? "has" : "have"} no date and sit
            {analytics.datelessCount === 1 ? "s" : ""} out of the time-based charts.
          </p>
        )}
      </div>

      <section className={cardClass("fluid")}>
        <div className="mb-4 flex flex-col gap-1">
          <Eyebrow>Progression</Eyebrow>
          <p className="text-xs text-muted">
            Personal best over time — each dot is the hardest send of that month.
          </p>
        </div>
        {analytics.progression.length === 0 ? (
          <p className="text-sm text-muted">
            No dated sends with grades yet — progression appears once sends carry dates.
          </p>
        ) : (
          <ProgressionChart type={scope} points={analytics.progression[0].points} />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <section className={cardClass("fluid")}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Eyebrow>Grade pyramid</Eyebrow>
              <p className="text-xs text-muted">Sends per grade, hardest on top.</p>
            </div>
            {analytics.years.length > 0 && (
              <AnalyticsYearSelect
                param="pyramid"
                years={analytics.years.toReversed()}
                selected={pyramidYear}
                allLabel="All time"
                label="Pyramid year"
              />
            )}
          </div>
          {pyramidRows.length === 0 ? (
            <p className="text-sm text-muted">
              {pyramidYear == null ? "No graded sends yet." : `No graded sends in ${pyramidYear}.`}
            </p>
          ) : (
            <AnalyticsGradePyramid type={scope} rows={pyramidRows} />
          )}
        </section>

        <section className={cardClass("fluid")}>
          <div className="mb-4 flex flex-col gap-1">
            <Eyebrow>Breakthroughs</Eyebrow>
            <p className="text-xs text-muted">
              Every send that raised the ceiling, and the wait before it.
            </p>
          </div>
          {analytics.breakthroughs.length === 0 ? (
            <p className="text-sm text-muted">
              No dated breakthroughs yet — they need sends with both a grade and a date.
            </p>
          ) : (
            <BreakthroughList breakthroughs={analytics.breakthroughs} showDiscipline={false} />
          )}
        </section>
      </div>

      <section className={cardClass("fluid")}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Eyebrow>{journalVisible ? "Outdoor calendar" : "Sending calendar"}</Eyebrow>
            <p className="text-xs text-muted">
              {journalVisible
                ? "Climb sessions per day — darker squares, more routes logged."
                : "Sends per day — darker squares, bigger days."}
            </p>
          </div>
          {analytics.calendarYears.length > 1 && (
            <AnalyticsYearSelect
              param="year"
              years={analytics.calendarYears.toReversed()}
              selected={year}
              label="Calendar year"
            />
          )}
        </div>
        {year == null ? (
          <p className="text-sm text-muted">
            {journalVisible
              ? "No outdoor sessions yet — the calendar fills in as sessions are logged."
              : "No dated sends yet — the calendar fills in as sends carry dates."}
          </p>
        ) : (
          <ClimbingCalendar
            countsByDay={analytics.calendarCounts}
            year={year}
            hue={hue}
            unit={journalVisible ? "session" : "send"}
          />
        )}
      </section>

      <StatTiles tiles={consistencyTiles} className="grid-cols-2 xl:grid-cols-4" />
    </div>
  );
}
