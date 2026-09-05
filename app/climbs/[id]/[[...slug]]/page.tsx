import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import { ASCENT_STYLE_LABELS } from "@/components/ascent-style";
import { AreaBreadcrumbs } from "@/components/breadcrumbs";
import { ClimbActionsMenu } from "@/components/climb-actions-menu";
import { ClimbDescription } from "@/components/climb-description";
import { GradeWithTrend } from "@/components/climb-list";
import { ClimbSendList } from "@/components/climb-send-list";
import { ClimbJournalCard, LogEntryButton } from "@/components/journal";
import { LoggedGradeHistogram } from "@/components/logged-grade-histogram";
import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Grade } from "@/components/ui/grade";
import { JsonLd } from "@/components/ui/json-ld";
import { SidebarLayout } from "@/components/ui/page-shell";
import { RatingStars } from "@/components/ui/rating-stars";
import { StatStrip } from "@/components/ui/stat-strip";
import { PageTitle, SectionHeading } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import {
  type Area,
  getAncestors,
  getArea,
  getClimb,
  getClimbSendSummary,
  getJournalForClimb,
  getSendsForClimb,
  getUserSendForClimb,
} from "@/db/queries";
import { buildLoggedGradeRows } from "@/lib/grade-histogram";
import { formatGrade } from "@/lib/grades";
import type { SearchParamsRecord } from "@/lib/search-params";
import type { AscentStyle as AscentStyleType } from "@/lib/sends";
import { climbDescription, climbJsonLd, climbTitle, locationTrail, pageMetadata } from "@/lib/seo";
import { getSession } from "@/lib/session";
import { signInUrl } from "@/lib/sign-in-redirect";
import { areaHref, climbHref, slugify, withQuery } from "@/lib/slug";

type ClimbPageProps = {
  // Optional catch-all: `slug` is undefined for /climbs/:id and a segment
  // array for /climbs/:id/anything. The id is authoritative; the slug is
  // decorative and normalized by the redirect below.
  params: Promise<{ id: string; slug?: string[] }>;
  searchParams: Promise<SearchParamsRecord>;
};

// Shared between generateMetadata and the page — see the identical pattern in
// app/areas/[id]/page.tsx for why the whole id -> row lookup is memoized
// rather than the (db, id)-keyed query helper. The area and its ancestor
// chain are keyed the same way so generateMetadata (title, description,
// breadcrumb JSON-LD) and the page share one round trip for each.
const getClimbById = cache(async (id: number) => {
  const db = await getDb();
  return getClimb(db, id);
});

const getAreaById = cache(async (id: number) => getArea(await getDb(), id));

const getAreaAncestors = cache(async (area: Area) => getAncestors(await getDb(), area));

export async function generateMetadata({
  params,
  searchParams,
}: ClimbPageProps): Promise<Metadata> {
  const [{ id, slug }, search] = await Promise.all([params, searchParams]);
  const climbId = Number(id);
  if (!Number.isInteger(climbId)) notFound();

  const climb = await getClimbById(climbId);
  if (!climb) notFound();

  // Normalize any other spelling of the URL (no slug, stale slug, extra
  // segments) to the canonical id + slug. On this streamed Workers deployment
  // it emits a `<meta http-equiv="refresh" content="0;url=...">` rather than a
  // 308 — Google treats a 0-second refresh as a permanent redirect, and the
  // rendered page's rel=canonical points at the same URL.
  if ((slug?.join("/") ?? "") !== slugify(climb.name)) {
    permanentRedirect(withQuery(climbHref(climb.id, climb.name), search));
  }

  const area = await getAreaById(climb.areaId);
  if (!area) notFound();
  const ancestors = await getAreaAncestors(area);

  const trail = locationTrail([...ancestors.map((a) => a.name), area.name]);
  return pageMetadata({
    title: climbTitle(climb, area.name),
    description: climbDescription(climb, trail),
    path: climbHref(climb.id, climb.name),
    ogType: "article",
  });
}

// oxlint-disable-next-line complexity
export default async function ClimbPage({ params, searchParams }: ClimbPageProps) {
  const [{ id, slug }, search] = await Promise.all([params, searchParams]);
  const climbId = Number(id);

  if (!Number.isInteger(climbId)) notFound();

  // Grouped by dependency tier so independent fetches overlap instead of
  // waterfalling: the db handle, the climb row, and the session don't depend
  // on each other; the sends queries need only the climb; and the ancestor
  // chain needs the area row's parentId.
  const [db, climb, session] = await Promise.all([getDb(), getClimbById(climbId), getSession()]);
  if (!climb) notFound();

  if ((slug?.join("/") ?? "") !== slugify(climb.name)) {
    permanentRedirect(withQuery(climbHref(climb.id, climb.name), search));
  }

  // Stats come from whole-history aggregates and the list from a paginated
  // query — a popular climb's full send history never ships in the RSC
  // payload (ClimbSendList "load more"-fetches the rest on demand).
  const [area, userSend, sendsPage, summary] = await Promise.all([
    getAreaById(climb.areaId),
    session ? getUserSendForClimb(db, session.user.id, climb.id).then((s) => s ?? null) : null,
    getSendsForClimb(db, climb.id, 0, undefined, session?.user.id ?? null),
    getClimbSendSummary(db, climb.id),
  ]);
  if (!area) notFound();

  const [ancestors, journalEntries] = await Promise.all([
    getAreaAncestors(area),
    session
      ? getJournalForClimb(db, session.user.id, session.user.id, climb.id)
      : Promise.resolve([]),
  ]);

  const trail = locationTrail([...ancestors.map((a) => a.name), area.name]);
  const breadcrumbCrumbs = [
    { name: "Home", path: "/" },
    ...ancestors.map((a) => ({ name: a.name, path: areaHref(a.id, a.name) })),
    { name: area.name, path: areaHref(area.id, area.name) },
    { name: climb.name, path: climbHref(climb.id, climb.name) },
  ];

  const loggedBreakdown = Object.entries(summary.styleBreakdown).filter(([, count]) => count > 0);
  const loggedGradeRows = buildLoggedGradeRows(
    climb.type,
    summary.suggestedGradeCounts,
    climb.grade,
  );

  return (
    <div className="flex flex-col gap-6">
      <JsonLd
        data={climbJsonLd({
          name: climb.name,
          path: climbHref(climb.id, climb.name),
          description: climbDescription(climb, trail),
          crumbs: breadcrumbCrumbs,
        })}
      />
      <AreaBreadcrumbs ancestors={[...ancestors, area]} current={climb} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <Eyebrow>Climb</Eyebrow>
          <PageTitle>{climb.name}</PageTitle>
          <div className="mt-1 flex items-center gap-2">
            <Grade size="md">{formatGrade(climb.type, climb.grade)}</Grade>
            <DisciplineChip type={climb.type} />
          </div>
          <ClimbDescription climb={climb} isEditor={session != null} />
        </div>
        {session && (
          <div className="flex shrink-0 items-center gap-2">
            <LogEntryButton
              climb={climb}
              sentClimbIds={userSend ? new Set([climb.id]) : undefined}
            />
            <ClimbActionsMenu climb={climb} send={userSend ?? undefined} />
          </div>
        )}
      </div>

      <SidebarLayout
        side="left"
        sidebarWidthClass="lg:w-80"
        sidebar={
          <>
            <StatStrip
              cards={[
                {
                  key: "summary",
                  stats: [
                    {
                      label: "Community rating",
                      value: <RatingStars rating={summary.avgRating} precision="decimal" />,
                    },
                    { label: "Logged ascents", value: summary.sendCount },
                    ...(summary.avgSuggestedGrade != null
                      ? [
                          {
                            label: "Suggested grade",
                            value: (
                              <GradeWithTrend
                                type={climb.type}
                                grade={climb.grade}
                                avgSuggestedGrade={summary.avgSuggestedGrade}
                              />
                            ),
                          },
                        ]
                      : []),
                  ],
                },
                ...(loggedBreakdown.length > 0
                  ? [
                      {
                        key: "breakdown",
                        heading: <Eyebrow>Ascent breakdown</Eyebrow>,
                        stats: loggedBreakdown.map(([type, count]) => ({
                          label: ASCENT_STYLE_LABELS[type as AscentStyleType],
                          value: count,
                        })),
                      },
                    ]
                  : []),
              ]}
            />
            {loggedGradeRows.length > 0 && (
              <div className={cardClass("sm")}>
                <div className="mb-3">
                  <Eyebrow>Logged grades</Eyebrow>
                </div>
                <LoggedGradeHistogram type={climb.type} rows={loggedGradeRows} />
              </div>
            )}
            {!session && (
              // Quiet stand-in for Log Send: signed-out visitors otherwise
              // never learn ascents can be logged. The continuation brings
              // them straight back here after signing in.
              <AppLink
                href={signInUrl(climbHref(climb.id, climb.name))}
                className="text-center text-sm text-muted"
              >
                Sign in to log this climb
              </AppLink>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-6">
          {session && (
            <ClimbJournalCard
              userId={session.user.id}
              climbId={climb.id}
              entries={journalEntries}
            />
          )}
          <div className="flex flex-col gap-3">
            <SectionHeading>Sends</SectionHeading>
            <ClimbSendList
              climb={climb}
              initialSends={sendsPage.sends}
              initialHasMore={sendsPage.hasMore}
              currentUserId={session?.user.id}
              emptyState={
                <EmptyState
                  message="No sends yet — this line is waiting for its first ascent."
                  cta={
                    session ? undefined : (
                      <AppLink
                        href={signInUrl(climbHref(climb.id, climb.name))}
                        className="text-sm"
                      >
                        Sign in to log the first send
                      </AppLink>
                    )
                  }
                />
              }
            />
          </div>
        </div>
      </SidebarLayout>
    </div>
  );
}
