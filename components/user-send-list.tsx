"use client";

import { Checkbox } from "@heroui/react";
import { useRouter } from "next/navigation";

import { AreaSearchField } from "@/components/area-search-field";
import { AscentStyle, ASCENT_STYLE_LABELS } from "@/components/ascent-style";
import { ClimbLogRow } from "@/components/climb-log-row";
import { FilterToolbar } from "@/components/filter-toolbar";
import { LogEntryButton } from "@/components/journal";
import { NavigationPendingRegion } from "@/components/navigation-pending";
import { RouteSearchField } from "@/components/route-search-field";
import { SendActionsMenu } from "@/components/send-actions-menu";
import { SendGradeCell } from "@/components/send-grade-cell";
import { SendListShell } from "@/components/send-list-shell";
import { AppLink } from "@/components/ui/app-link";
import { EmptyState } from "@/components/ui/empty-state";
import { LabeledIndexSelect } from "@/components/ui/index-select";
import { SortSelect } from "@/components/ui/sort-select";
import type { AreaBreadcrumbs, UserSendRow, UserSendsFilter } from "@/db/queries";
import { useFilterFormNavigation } from "@/hooks/use-filter-form-navigation";
import { usePagedList } from "@/hooks/use-paged-list";
import { RATING_OPTIONS } from "@/lib/climb-stats-filter";
import { ASCENT_STYLES, type AscentStyle as AscentStyleType } from "@/lib/sends";
import { DEFAULT_USER_SENDS_FILTER, userSendsFilterToSearchParams } from "@/lib/user-sends-filter";

function AscentStyleFields({
  value,
  onChange,
}: {
  value: AscentStyleType[];
  onChange: (value: AscentStyleType[]) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-start gap-3">
      <span className="text-sm font-medium text-foreground">Ascent style</span>
      <div className="flex flex-wrap items-center justify-start gap-4">
        {ASCENT_STYLES.map((style) => (
          <Checkbox
            key={style}
            isSelected={value.includes(style)}
            onChange={(checked) =>
              onChange(checked ? [...value, style] : value.filter((s) => s !== style))
            }
          >
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              {ASCENT_STYLE_LABELS[style]}
            </Checkbox.Content>
          </Checkbox>
        ))}
      </div>
    </div>
  );
}

function MinRatingSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <LabeledIndexSelect
      label="Min rating"
      options={RATING_OPTIONS}
      index={value}
      onChange={onChange}
    />
  );
}

type UserSendListProps = {
  userId: string;
  filter: UserSendsFilter;
  initialSends: UserSendRow[];
  initialHasMore: boolean;
  initialAreaBreadcrumbs: AreaBreadcrumbs;
  /** Distinguishes an empty logbook from a filter with no matches. */
  hasAnySends: boolean;
  currentUserId?: string | null;
};

type SortField = "date" | "grade" | "rating";

const SORT_FIELDS: { id: SortField; label: string }[] = [
  { id: "date", label: "Date" },
  { id: "grade", label: "Grade" },
  { id: "rating", label: "Rating" },
];

const DEFAULT_DIRECTION: Record<SortField, "asc" | "desc"> = {
  date: "desc",
  grade: "desc",
  rating: "desc",
};

/** Do not key the toolbar by filters: remounting loses input focus when a
 * debounced navigation lands. The hook adopts external URL changes in place. */
export function UserSendsFilterToolbar({
  filter,
  basePath,
}: {
  filter: UserSendsFilter;
  basePath: string;
}) {
  const router = useRouter();
  const {
    name,
    setName,
    areaName,
    setAreaName,
    filter: disciplineFilter,
    setFilter: setDisciplineFilter,
    reset,
  } = useFilterFormNavigation({
    initialFilter: {
      date: filter.date,
      disciplines: filter.disciplines,
      boulderRange: filter.boulderRange,
      sportRange: filter.sportRange,
      tradRange: filter.tradRange,
      ascentStyles: filter.ascentStyles,
      minRating: filter.minRating,
    },
    initialName: filter.name ?? "",
    initialAreaName: filter.areaName ?? "",
    defaultFilter: DEFAULT_USER_SENDS_FILTER,
    sort: filter.sort,
    defaultSort: DEFAULT_USER_SENDS_FILTER.sort,
    buildHref: (disciplineFilter, name, areaName, sort) =>
      `${basePath}?${userSendsFilterToSearchParams({ ...disciplineFilter, name, areaName, sort }).toString()}`,
  });

  return (
    <FilterToolbar
      value={disciplineFilter}
      onChange={setDisciplineFilter}
      onReset={reset}
      search={
        <RouteSearchField
          value={name}
          onChange={setName}
          onSelect={(route) => setName(route.name)}
          ariaLabel="Search route name"
          className="w-full sm:w-64"
        />
      }
      sortControl={
        <SortSelect
          sort={filter.sort ?? "date_desc"}
          fields={SORT_FIELDS}
          defaultField="date"
          defaultDirection={DEFAULT_DIRECTION}
          onNavigate={(nextSort) => {
            const params = userSendsFilterToSearchParams({ ...filter, sort: nextSort });
            router.replace(`${basePath}?${params.toString()}`, { scroll: false });
          }}
        />
      }
      extraFilters={
        <>
          {/* Inline label, matching Ascent Style and Min Rating below. */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="shrink-0 text-sm font-medium text-foreground">In area</span>
            <AreaSearchField
              value={areaName}
              onChange={setAreaName}
              onSelect={(area) => setAreaName(area.name)}
              ariaLabel="Filter by area"
              placeholder="Anywhere"
              className="w-full sm:w-64"
            />
          </div>
          <AscentStyleFields
            value={disciplineFilter.ascentStyles}
            onChange={(ascentStyles) => setDisciplineFilter({ ...disciplineFilter, ascentStyles })}
          />
          <MinRatingSelect
            value={disciplineFilter.minRating}
            onChange={(minRating) => setDisciplineFilter({ ...disciplineFilter, minRating })}
          />
        </>
      }
    />
  );
}

type UserSendsPageResponse = {
  sends: UserSendRow[];
  hasMore: boolean;
  areaBreadcrumbs: AreaBreadcrumbs;
};

/** Key the list by filters. Same-key refreshes supply a new initialSends
 * identity, resetting loaded pages after send edits or deletion. */
export function UserSendList({
  userId,
  filter,
  initialSends,
  initialHasMore,
  initialAreaBreadcrumbs,
  hasAnySends,
  currentUserId,
}: UserSendListProps) {
  const {
    items: sends,
    hasMore,
    meta: areaBreadcrumbs,
    loadingMore,
    loadMoreFailed,
    loadMore,
  } = usePagedList({
    initialItems: initialSends,
    initialHasMore,
    initialMeta: initialAreaBreadcrumbs,
    itemKey: (send) => send.id,
    mergeMeta: (current, incoming) => ({ ...current, ...incoming }),
    fetchPage: async (offset) => {
      const params = userSendsFilterToSearchParams(filter);
      params.set("offset", String(offset));
      const res = await fetch(`/api/users/${userId}/sends?${params.toString()}`);
      if (!res.ok) throw new Error(`Loading sends failed: ${res.status}`);
      const data: UserSendsPageResponse = await res.json();
      return {
        items: data.sends,
        hasMore: data.hasMore,
        meta: data.areaBreadcrumbs,
      };
    },
  });

  if (!hasAnySends) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          message="No sends yet."
          cta={
            currentUserId === userId ? (
              <div className="flex flex-col items-center gap-3">
                <LogEntryButton />
                <AppLink href="/account/import" className="text-sm">
                  Import your sends
                </AppLink>
              </div>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Dimmed while the toolbar's debounced navigation is re-fetching
       * these results (see NavigationPendingProvider in the page). */}
      <NavigationPendingRegion>
        <SendListShell
          sends={sends}
          emptyState={<EmptyState message="No sends match these filters." />}
          hasMore={hasMore}
          onLoadMore={loadMore}
          loadingMore={loadingMore}
          loadMoreFailed={loadMoreFailed}
          renderRow={(send) => (
            <ClimbLogRow
              climb={{
                id: send.climbId,
                name: send.climbName,
                areaId: send.areaId,
                areaName: send.areaName,
              }}
              areaBreadcrumbs={areaBreadcrumbs}
              grade={
                <SendGradeCell
                  type={send.climbType}
                  grade={send.climbGrade}
                  suggestedGrade={send.suggestedGrade}
                  gradeFeel={send.gradeFeel}
                  rating={send.rating}
                />
              }
              status={<AscentStyle type={send.ascentStyle} />}
              date={send.dateSent}
              actions={
                currentUserId === userId && (
                  <SendActionsMenu
                    climb={{
                      id: send.climbId,
                      areaId: send.areaId,
                      type: send.climbType,
                      grade: send.climbGrade,
                    }}
                    send={send}
                  />
                )
              }
              comment={send.comment}
            />
          )}
        />
      </NavigationPendingRegion>
    </div>
  );
}
