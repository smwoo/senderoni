"use server";

import { sql } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";

import { getDb } from "@/db/client";
import { getFriendship } from "@/db/queries/friendships";
import { getUser } from "@/db/queries/users";
import { ActionError, toActionResult, type ActionResult } from "@/lib/action-result";
import { sendFriendRequestEmail } from "@/lib/email";
import { friendshipPair, type FriendshipStatus } from "@/lib/friendships";
import { allowFriendshipWrite } from "@/lib/rate-limit";
import { requireSession } from "@/lib/session";

function validateTarget(targetId: string, viewerId: string) {
  if (typeof targetId !== "string" || !targetId.trim() || targetId.length > 128)
    throw new ActionError("Invalid climber");
  if (targetId === viewerId) throw new ActionError("You can't add yourself as a friend");
}

function refreshFriends(viewerId: string, targetId: string) {
  revalidatePath("/feed");
  revalidatePath("/friends");
  revalidatePath("/");
  for (const id of [viewerId, targetId])
    for (const suffix of ["", "/journal", "/sends", "/analytics"])
      revalidatePath(`/users/${id}${suffix}`);
  refresh();
}

export async function requestFriendship(targetId: string): Promise<ActionResult<FriendshipStatus>> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    validateTarget(targetId, user.id);
    if (!(await allowFriendshipWrite(user.id)))
      throw new ActionError("Too many friend requests — try again in a minute");
    const db = await getDb();
    const pair = friendshipPair(user.id, targetId);
    // Only the insert winner sends email. Duplicate and crossed requests leave
    // the existing pair untouched and never send another notification.
    const inserted = await db.get(sql`
      INSERT INTO friendships (user_id, friend_id, requested_by)
      SELECT ${pair.userId}, ${pair.friendId}, ${user.id} FROM user WHERE id = ${targetId} AND is_private = 0
      ON CONFLICT (user_id, friend_id) DO NOTHING
      RETURNING user_id
    `);
    let status: FriendshipStatus = "outgoing";
    if (inserted) {
      try {
        const [requester, recipient] = await Promise.all([
          getUser(db, user.id),
          getUser(db, targetId),
        ]);
        if (requester && recipient) await sendFriendRequestEmail(recipient.email, requester.name);
      } catch (err) {
        // The request is already saved. Email failure must not turn it into a
        // failed action or encourage duplicate submissions.
        console.error("friend request email failed", err);
      }
    } else {
      const target = await getUser(db, targetId);
      if (!target || target.isPrivate) throw new ActionError("Climber not found");
      status = await getFriendship(db, user.id, targetId);
      if (status === "none") throw new ActionError("Climber not found");
    }
    refreshFriends(user.id, targetId);
    return status;
  });
}

export async function acceptFriendRequest(
  targetId: string,
): Promise<ActionResult<FriendshipStatus>> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    validateTarget(targetId, user.id);
    const pair = friendshipPair(user.id, targetId);
    const db = await getDb();
    const row = await db.get(sql`
      UPDATE friendships SET status = 'accepted'
      WHERE user_id = ${pair.userId} AND friend_id = ${pair.friendId} AND requested_by = ${targetId}
      RETURNING user_id
    `);
    if (!row) throw new ActionError("This friend request is no longer available");
    refreshFriends(user.id, targetId);
    return "friends" as const;
  });
}

async function endRelationship(
  targetId: string,
  operation: "cancel" | "decline" | "remove",
): Promise<FriendshipStatus> {
  const { user } = await requireSession();
  validateTarget(targetId, user.id);
  const pair = friendshipPair(user.id, targetId);
  const db = await getDb();
  const removed = await db.get(sql`
    DELETE FROM friendships WHERE user_id = ${pair.userId} AND friend_id = ${pair.friendId}
      AND status = ${operation === "remove" ? "accepted" : "pending"}
      ${operation === "remove" ? sql`` : sql`AND requested_by = ${operation === "cancel" ? user.id : targetId}`}
    RETURNING user_id
  `);
  if (!removed && (await getFriendship(db, user.id, targetId)) !== "none")
    throw new ActionError("Couldn't save that change. Refresh and try again.");
  refreshFriends(user.id, targetId);
  return "none";
}

export async function cancelFriendRequest(
  targetId: string,
): Promise<ActionResult<FriendshipStatus>> {
  return toActionResult(() => endRelationship(targetId, "cancel"));
}
export async function declineFriendRequest(
  targetId: string,
): Promise<ActionResult<FriendshipStatus>> {
  return toActionResult(() => endRelationship(targetId, "decline"));
}
export async function removeFriendship(targetId: string): Promise<ActionResult<FriendshipStatus>> {
  return toActionResult(() => endRelationship(targetId, "remove"));
}
