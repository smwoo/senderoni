export type FriendshipStatus = "none" | "incoming" | "outgoing" | "friends";

/** One canonical row for the unordered pair, regardless of who requests first. */
export function friendshipPair(a: string, b: string) {
  return a < b ? { userId: a, friendId: b } : { userId: b, friendId: a };
}
