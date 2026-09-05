"use client";

import { useRouter } from "next/navigation";

import { FriendshipButton } from "@/components/friendship-button";
import { AppLink } from "@/components/ui/app-link";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { FriendRow, FriendsPage } from "@/db/queries";
import { usePagedList } from "@/hooks/use-paged-list";
import { signInUrl } from "@/lib/sign-in-redirect";

export function FriendList({
  initialPage,
  requestsOnly,
}: {
  initialPage: FriendsPage;
  requestsOnly: boolean;
}) {
  const router = useRouter();
  const { items, hasMore, loadingMore, loadMoreFailed, loadMore } = usePagedList<FriendRow, null>({
    initialItems: initialPage.friends,
    initialHasMore: initialPage.hasMore,
    initialMeta: null,
    itemKey: (row) => row.id,
    mergeMeta: () => null,
    fetchPage: async (offset) => {
      const response = await fetch(
        `/api/friends?offset=${offset}&view=${requestsOnly ? "requests" : "all"}`,
        { cache: "no-store" },
      );
      if (response.status === 401) router.replace(signInUrl("/friends"));
      if (!response.ok) throw new Error("Couldn't load friends");
      const page = (await response.json()) as FriendsPage;
      return { items: page.friends, hasMore: page.hasMore, meta: null };
    },
  });
  if (!items.length)
    return (
      <EmptyState
        message={
          requestsOnly
            ? "No pending friend requests."
            : "No friends yet. Find your climbing partners or share your profile."
        }
        cta={<AppLink href="/?mode=climber">Find climbers</AppLink>}
      />
    );
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-x-8 lg:grid-cols-2">
        {items.map((friend) => {
          const detail = [
            friend.friendshipStatus === "incoming"
              ? "Wants to be friends"
              : friend.friendshipStatus === "outgoing"
                ? "Waiting for a reply"
                : null,
            friend.isPrivate ? "Private profile" : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <article
              key={friend.id}
              className="flex min-w-0 flex-col gap-3 border-b border-separator py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <UserAvatar name={friend.name} image={friend.image} size="sm" />
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">
                    {friend.isPrivate ? (
                      friend.name
                    ) : (
                      <AppLink href={`/users/${friend.id}`}>{friend.name}</AppLink>
                    )}
                  </h2>
                  {detail && <p className="text-sm text-muted">{detail}</p>}
                </div>
              </div>
              <FriendshipButton
                userId={friend.id}
                name={friend.name}
                initialStatus={friend.friendshipStatus}
                signedIn
              />
            </article>
          );
        })}
      </div>
      {hasMore && (
        <LoadMoreButton onPress={loadMore} loading={loadingMore} failed={loadMoreFailed} />
      )}
    </div>
  );
}
