import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ProfileHeader, getUserById } from "@/app/users/[id]/profile-shell";
import { FeedList } from "@/components/feed-list";
import { AppLink } from "@/components/ui/app-link";
import { choicePillClass } from "@/components/ui/choice-pill";
import { SectionHeading } from "@/components/ui/typography";
import { ViewerBoundary } from "@/components/viewer-boundary";
import { getDb } from "@/db/client";
import { getFriendsPage, getFeedPage } from "@/db/queries";
import { parseFeedView } from "@/lib/feed";
import type { SearchParamsRecord } from "@/lib/search-params";
import { getSession } from "@/lib/session";
import { signInUrl } from "@/lib/sign-in-redirect";

export const metadata: Metadata = { title: "Feed", robots: { index: false } };

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const session = await getSession();
  if (!session) redirect(signInUrl("/feed"));
  const view = parseFeedView((await searchParams).view);
  const db = await getDb();
  const [page, friends, owner] = await Promise.all([
    getFeedPage(db, session.user.id, view),
    getFriendsPage(db, session.user.id),
    getUserById(session.user.id),
  ]);
  if (!owner) notFound();
  return (
    <ViewerBoundary viewerId={session.user.id}>
      <div className="flex flex-col gap-6">
        <ProfileHeader user={owner} viewerId={session.user.id} />
        <section aria-label="Feed" className="flex w-full min-w-0 flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionHeading>Feed</SectionHeading>
            <div className="text-sm">
              <AppLink href="/?mode=climber">Find climbers</AppLink>
            </div>
          </div>
          <p className="max-w-3xl text-sm text-muted">
            See what your friends have been climbing. Journal entries and notes appear here only
            when shared with you. Choose what you share in{" "}
            <AppLink href="/account">Account settings</AppLink>.
          </p>
          <nav aria-label="Feed activity" className="flex gap-2">
            {(["all", "sends"] as const).map((value) => (
              <AppLink
                key={value}
                href={`/feed?view=${value}`}
                className={choicePillClass(value === view, "bg-foreground text-background")}
                aria-current={value === view ? "page" : undefined}
              >
                {value === "all" ? "All activity" : "Sends"}
              </AppLink>
            ))}
          </nav>
          <FeedList
            viewerId={session.user.id}
            key={`${session.user.id}:${view}`}
            initialPage={page}
            view={view}
            hasFriends={friends.friends.length > 0}
          />
        </section>
      </div>
    </ViewerBoundary>
  );
}
