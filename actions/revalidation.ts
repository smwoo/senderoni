import { revalidatePath } from "next/cache";

/** Every cached surface whose rendered aggregates or rows can change after a
 * send write. Keeping this set centralized prevents a new mutation path from
 * quietly omitting the feed, profile, climb, or area list. */
export function revalidateSendSurfaces({
  userIds,
  climbIds,
  areaIds,
}: {
  userIds: Iterable<string>;
  climbIds: Iterable<number>;
  areaIds: Iterable<number>;
}) {
  revalidatePath("/");
  revalidatePath("/feed");
  for (const userId of new Set(userIds)) {
    revalidatePath(`/users/${userId}`);
    revalidatePath(`/users/${userId}/sends`);
    revalidatePath(`/users/${userId}/projects`);
    revalidatePath(`/users/${userId}/analytics`);
  }
  for (const climbId of new Set(climbIds)) revalidatePath(`/climbs/${climbId}`);
  for (const areaId of new Set(areaIds)) revalidatePath(`/areas/${areaId}`);
}

export function revalidateJournalSurfaces({
  userId,
  climbIds,
}: {
  userId: string;
  climbIds: Iterable<number>;
}) {
  revalidatePath("/feed");
  revalidatePath(`/users/${userId}`);
  revalidatePath(`/users/${userId}/journal`);
  revalidatePath(`/users/${userId}/projects`);
  revalidatePath(`/users/${userId}/analytics`);
  for (const climbId of new Set(climbIds)) revalidatePath(`/climbs/${climbId}`);
}
