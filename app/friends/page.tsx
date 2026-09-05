import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ProfileHeader, getUserById } from "@/app/users/[id]/profile-shell";
import { FriendList } from "@/components/friend-list";
import { FriendTabs } from "@/components/friend-tabs";
import { AppLink } from "@/components/ui/app-link";
import { SectionHeading } from "@/components/ui/typography";
import { ViewerBoundary } from "@/components/viewer-boundary";
import { getDb } from "@/db/client";
import { getFriendsPage } from "@/db/queries";
import type { SearchParamsRecord } from "@/lib/search-params";
import { getSession } from "@/lib/session";
import { signInUrl } from "@/lib/sign-in-redirect";

export const metadata: Metadata = { title: "Friends", robots: { index: false } };

export default async function FriendsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const requestsOnly = (await searchParams).view === "requests";
  const session = await getSession();
  if (!session) redirect(signInUrl(requestsOnly ? "/friends?view=requests" : "/friends"));
  const db = await getDb();
  const [page, owner] = await Promise.all([
    getFriendsPage(db, session.user.id, requestsOnly),
    getUserById(session.user.id),
  ]);
  if (!owner) notFound();
  return (
    <ViewerBoundary viewerId={session.user.id}>
      <div className="flex flex-col gap-6">
        <ProfileHeader user={owner} viewerId={session.user.id} />
        <section aria-label="Friends" className="flex w-full min-w-0 flex-col gap-5">
          <SectionHeading>Friends</SectionHeading>
          <p className="text-sm text-muted">
            Accept a request to add someone as a friend. You can remove a friend at any time. Only
            you can see this list.
          </p>
          <div className="flex flex-wrap gap-4">
            <AppLink href="/?mode=climber">Find climbers</AppLink>
            <AppLink href="/account">Journal privacy</AppLink>
          </div>
          <FriendTabs requestsOnly={requestsOnly} userId={session.user.id} />
          <FriendList
            key={`${session.user.id}:${requestsOnly}`}
            initialPage={page}
            requestsOnly={requestsOnly}
          />
        </section>
      </div>
    </ViewerBoundary>
  );
}
