"use client";

import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

import { FeedDayCard } from "@/components/feed-day-card";
import { AppLink } from "@/components/ui/app-link";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import type { FeedDay, FeedPage } from "@/db/queries";
import { useMounted } from "@/hooks/use-mounted";
import { usePagedList } from "@/hooks/use-paged-list";
import { authClient } from "@/lib/auth-client";
import type { FeedCursor, FeedView } from "@/lib/feed";
import { signInUrl } from "@/lib/sign-in-redirect";

export function FeedList({
  initialPage,
  view,
  hasFriends,
  viewerId,
}: {
  initialPage: FeedPage;
  view: FeedView;
  hasFriends: boolean;
  viewerId: string;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const mounted = useMounted();
  const { data: session, isPending } = authClient.useSession();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  const { items, hasMore, loadingMore, loadMoreFailed, loadMore } = usePagedList<FeedDay, null>({
    initialItems: initialPage.days,
    initialHasMore: initialPage.hasMore,
    initialMeta: null,
    itemKey: (day) => JSON.stringify([day.date, day.userId]),
    mergeMeta: () => null,
    fetchPage: async (_offset, _page, last) => {
      const params = new URLSearchParams({ view });
      if (last)
        params.set(
          "cursor",
          JSON.stringify({
            version: 1,
            date: last.date,
            userId: last.userId,
            view,
          } satisfies FeedCursor),
        );
      const response = await fetch(`/api/feed?${params}`, { cache: "no-store" });
      if (response.status === 401) router.replace(signInUrl("/feed"));
      if (!response.ok) throw new Error("Couldn't load feed");
      const page = (await response.json()) as FeedPage;
      return { items: page.days, hasMore: page.hasMore, meta: null };
    },
  });
  if (mounted && !isPending && session?.user.id !== viewerId)
    return (
      <EmptyState
        message={
          session ? "Your account changed. Refresh to see your feed." : "Sign in to see your feed."
        }
        cta={
          session ? (
            <Button onPress={() => router.refresh()}>Refresh feed</Button>
          ) : (
            <AppLink href={signInUrl("/feed")}>Sign in</AppLink>
          )
        }
      />
    );
  return (
    <div className="flex flex-col gap-4">
      <Button
        variant="ghost"
        size="sm"
        className="self-end"
        isDisabled={refreshing}
        onPress={() => startRefresh(() => router.refresh())}
      >
        {refreshing ? "Refreshing…" : "Refresh feed"}
      </Button>
      {items.length === 0 ? (
        <EmptyState
          message={
            !hasFriends
              ? "Add friends to see what they've been climbing."
              : view === "sends"
                ? "No sends to show yet."
                : "No activity to show yet."
          }
          cta={<AppLink href="/?mode=climber">Find climbers</AppLink>}
        />
      ) : (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {items.map((day) => (
              <FeedDayCard key={JSON.stringify([day.date, day.userId])} day={day} view={view} />
            ))}
          </div>
          {hasMore ? (
            <LoadMoreButton onPress={loadMore} loading={loadingMore} failed={loadMoreFailed} />
          ) : (
            <p className="text-center text-sm text-muted">End of feed</p>
          )}
        </>
      )}
    </div>
  );
}
