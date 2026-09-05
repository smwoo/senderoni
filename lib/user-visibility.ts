/** The one predicate every page/route branches on to decide whether a
 * private user's profile and sends may be shown to a given viewer. A private
 * profile is visible only to its own owner — there's no partial/public
 * exception. This never governs aggregate queries (climb ratings, suggested
 * grade): those read `sends` directly with no join to `user`, so they're
 * unaffected by this flag by construction, not by a check anywhere. */
export function canViewUser(
  target: { id: string; isPrivate: boolean },
  viewerId: string | null,
): boolean {
  return !target.isPrivate || target.id === viewerId;
}
