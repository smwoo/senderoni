import { cache } from "react";

import { FriendshipButton } from "@/components/friendship-button";
import { LogEntryButton } from "@/components/journal";
import { ProfileHeading } from "@/components/profile-heading";
import { ProfileTabs } from "@/components/profile-tabs";
import { ShareProfileButton } from "@/components/share-profile-button";
import { getDb } from "@/db/client";
import { getUser, getFriendship, canReadJournal } from "@/db/queries";

export const getUserById = cache(async (id: string) => {
  const db = await getDb();
  return getUser(db, id);
});

export const canReadUserJournal = cache(async (id: string, viewerId: string | null) =>
  canReadJournal(await getDb(), id, viewerId),
);

type ProfileUser = {
  id: string;
  name: string;
  createdAt: Date;
  isPrivate: boolean;
};

export async function ProfileHeader({
  user,
  viewerId,
}: {
  user: ProfileUser;
  viewerId: string | null;
}) {
  const isOwner = viewerId === user.id;
  const relationship = await getFriendship(await getDb(), viewerId, user.id);
  const journalVisible = await canReadUserJournal(user.id, viewerId);

  return (
    <div className="flex flex-col gap-4">
      <ProfileHeading
        name={user.name}
        since={new Date(user.createdAt).getFullYear()}
        action={
          isOwner ? (
            <div className="flex flex-wrap items-start gap-2">
              <LogEntryButton />
              {!user.isPrivate && <ShareProfileButton userId={user.id} />}
            </div>
          ) : (
            <FriendshipButton
              userId={user.id}
              name={user.name}
              initialStatus={relationship}
              signedIn={!!viewerId}
            />
          )
        }
      />
      <ProfileTabs
        userId={user.id}
        showJournal={journalVisible}
        showProjects={isOwner}
        isOwner={isOwner}
      />
    </div>
  );
}
