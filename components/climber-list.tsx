"use client";

import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";

import { FriendshipButton } from "@/components/friendship-button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { ClimberRow, ClimbersPage } from "@/db/queries";
import { useMounted } from "@/hooks/use-mounted";
import { usePagedList } from "@/hooks/use-paged-list";
import { authClient } from "@/lib/auth-client";
import { signInUrl } from "@/lib/sign-in-redirect";

export function ClimberList({
  initialPage,
  signedIn,
  name = "",
  viewerId,
}: {
  initialPage: ClimbersPage;
  signedIn: boolean;
  name?: string;
  viewerId: string | null;
}) {
  const router = useRouter();
  const mounted = useMounted();
  const { data: session, isPending } = authClient.useSession();
  const { items, hasMore, loadingMore, loadMoreFailed, loadMore } = usePagedList<ClimberRow, null>({
    initialItems: initialPage.climbers,
    initialHasMore: initialPage.hasMore,
    initialMeta: null,
    itemKey: (item) => item.id,
    mergeMeta: () => null,
    fetchPage: async (offset) => {
      const params = new URLSearchParams({ name, offset: String(offset) });
      const response = await fetch(`/api/search/climbers?${params}`, { cache: "no-store" });
      if (response.status === 401) router.replace(signInUrl("/?mode=climber"));
      if (!response.ok) throw new Error("Couldn't load climbers");
      const page = (await response.json()) as ClimbersPage;
      return { items: page.climbers, hasMore: page.hasMore, meta: null };
    },
  });
  if (mounted && !isPending && (session?.user.id ?? null) !== viewerId)
    return (
      <EmptyState
        message="Your account changed. Refresh to update this list."
        cta={<Button onPress={() => router.refresh()}>Refresh climbers</Button>}
      />
    );
  if (items.length === 0)
    return (
      <EmptyState
        message={
          name
            ? "No climbers found. Private profiles aren't listed."
            : "Find a friend or climbing partner by name."
        }
      />
    );
  return (
    <div className="flex flex-col gap-4">
      <div className="divide-y divide-separator">
        {items.map((climber) => (
          <ListRow
            key={climber.id}
            leading={<UserAvatar name={climber.name} image={climber.image} size="sm" />}
            title={climber.name}
            href={`/users/${climber.id}`}
            stackActionsOnMobile
            actions={
              <FriendshipButton
                userId={climber.id}
                name={climber.name}
                initialStatus={climber.friendshipStatus}
                signedIn={signedIn}
              />
            }
          />
        ))}
      </div>
      {hasMore && (
        <LoadMoreButton onPress={loadMore} loading={loadingMore} failed={loadMoreFailed} />
      )}
    </div>
  );
}
