import { NavigationPendingProvider } from "@/components/navigation-pending";
import { AppLink } from "@/components/ui/app-link";
import { DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SidebarLayout } from "@/components/ui/page-shell";
import { StatStrip } from "@/components/ui/stat-strip";
import { SectionHeading } from "@/components/ui/typography";
import { UserSendList, UserSendsFilterToolbar } from "@/components/user-send-list";
import { getDb } from "@/db/client";
import { getAreaBreadcrumbs, getSendsForUserPage, getUserSendsSummary } from "@/db/queries";
import type { UserSendsFilter } from "@/db/queries";
import { formatCount } from "@/lib/format";
import { formatDate } from "@/lib/format-date";
import { userSendsFilterToSearchParams } from "@/lib/user-sends-filter";

export async function SendsView({
  userId,
  viewerId,
  filter,
  basePath,
}: {
  userId: string;
  viewerId: string | null;
  filter: UserSendsFilter;
  basePath: string;
}) {
  const db = await getDb();

  const [summary, firstPage] = await Promise.all([
    getUserSendsSummary(db, userId),
    getSendsForUserPage(db, userId, filter, 0, undefined, viewerId),
  ]);

  const areaBreadcrumbs = await getAreaBreadcrumbs(
    db,
    firstPage.sends.map((send) => send.areaId),
  );

  const statCards = [
    {
      key: "profile",
      stats: [
        { label: "Sends", value: summary.sendCount },
        { label: "Areas", value: summary.areaCount },
        { label: "Peak grade", value: summary.peakGrade ?? "—" },
      ],
    },
    ...(summary.sendCount > 0
      ? [
          {
            key: "glance",
            heading: <Eyebrow>Log at a glance</Eyebrow>,
            stats: [
              { label: "Latest send", value: formatDate(summary.latestSendDate) },
              ...(summary.mostLoggedDiscipline
                ? [
                    {
                      label: "Most logged",
                      value: `${DISCIPLINE_LABELS[summary.mostLoggedDiscipline.type]} · ${formatCount(summary.mostLoggedDiscipline.count, "send")}`,
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),
  ];

  return (
    <NavigationPendingProvider>
      <SidebarLayout sidebar={<StatStrip cards={statCards} />}>
        <div className="flex flex-col gap-3">
          <SectionHeading>Sends</SectionHeading>
          {filter.date && (
            <p className="text-sm text-muted">
              {formatDate(filter.date)} ·{" "}
              <AppLink
                href={`${basePath}?${userSendsFilterToSearchParams({ ...filter, date: undefined })}`}
              >
                Clear day filter
              </AppLink>
            </p>
          )}
          {summary.sendCount > 0 && <UserSendsFilterToolbar filter={filter} basePath={basePath} />}
          <UserSendList
            key={JSON.stringify(filter)}
            userId={userId}
            filter={filter}
            initialSends={firstPage.sends}
            initialHasMore={firstPage.hasMore}
            initialAreaBreadcrumbs={areaBreadcrumbs}
            hasAnySends={summary.sendCount > 0}
            currentUserId={viewerId}
          />
        </div>
      </SidebarLayout>
    </NavigationPendingProvider>
  );
}
