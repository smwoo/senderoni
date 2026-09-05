import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader, getUserById } from "@/app/users/[id]/profile-shell";
import { ProjectsView } from "@/app/users/[id]/projects-view";
import { getSession } from "@/lib/session";

type UserProjectsPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: UserProjectsPageProps): Promise<Metadata> {
  const { id } = await params;
  const [user, session] = await Promise.all([getUserById(id), getSession()]);
  if (!user || session?.user.id !== user.id) notFound();

  return { title: `${user.name} · Projects`, robots: { index: false } };
}

export default async function UserProjectsPage({ params }: UserProjectsPageProps) {
  const { id } = await params;
  const [user, session] = await Promise.all([getUserById(id), getSession()]);
  if (!user || session?.user.id !== user.id) notFound();

  return (
    <div className="flex flex-col gap-6">
      <ProfileHeader user={user} viewerId={session.user.id} />
      <ProjectsView ownerId={user.id} />
    </div>
  );
}
