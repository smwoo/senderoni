import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JournalView } from "@/app/users/[id]/journal-view";
import { ProfileHeader, getUserById, canReadUserJournal } from "@/app/users/[id]/profile-shell";
import { SendsView } from "@/app/users/[id]/sends-view";
import { parseJournalFilter } from "@/lib/journal-filter";
import type { SearchParamsRecord } from "@/lib/search-params";
import { getSession } from "@/lib/session";
import { parseUserSendsFilter } from "@/lib/user-sends-filter";
import { canViewUser } from "@/lib/user-visibility";

type UserPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParamsRecord>;
};

export async function generateMetadata({ params }: UserPageProps): Promise<Metadata> {
  const { id } = await params;
  const [user, session] = await Promise.all([getUserById(id), getSession()]);
  if (!user || !canViewUser(user, session?.user.id ?? null)) notFound();

  return { title: user.name, robots: { index: false } };
}

export default async function UserPage({ params, searchParams }: UserPageProps) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const [user, session] = await Promise.all([getUserById(id), getSession()]);
  const viewerId = session?.user.id ?? null;

  if (!user || !canViewUser(user, viewerId)) notFound();

  const journalIsVisible = await canReadUserJournal(user.id, viewerId);

  return (
    <div className="flex flex-col gap-6">
      <ProfileHeader user={user} viewerId={viewerId} />
      {journalIsVisible ? (
        <JournalView ownerId={user.id} viewerId={viewerId} filter={parseJournalFilter(search)} />
      ) : (
        <SendsView
          userId={id}
          viewerId={viewerId}
          filter={parseUserSendsFilter(search)}
          basePath={`/users/${id}`}
        />
      )}
    </div>
  );
}
