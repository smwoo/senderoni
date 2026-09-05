"use client";

import { clsx } from "clsx";

import { FriendRequestDot } from "@/components/friend-request-badge";
import { useFriendRequests } from "@/components/friend-requests-provider";
import { NavLink } from "@/components/nav-link";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useMounted } from "@/hooks/use-mounted";
import { authClient } from "@/lib/auth-client";

type AuthNavProps = {
  direction?: "row" | "col";
  /** Fired when any of these links is pressed — the mobile drawer passes
   * its close() so a tap always dismisses it, including taps on a link to
   * the current page, where no route change happens to close it. */
  onNavigate?: () => void;
};

/** One placeholder per signed-in control, sized to the four text links and
 * account avatar they stand in for. The signed-in set is the widest (and,
 * for a logbook, the most common) state, so holding its geometry keeps the
 * header from reflowing when the session resolves. */
const PLACEHOLDER_WIDTHS = [
  { key: "search", width: "w-14" },
  { key: "add-climb", width: "w-21" },
  { key: "add-area", width: "w-20" },
  { key: "my-journal", width: "w-20" },
  { key: "account", width: "w-14" },
] as const;

export function AuthNav({ direction = "row", onNavigate }: AuthNavProps) {
  // better-auth's session store can resolve from a client-side cache before
  // the first paint, while the server always renders the pending state —
  // gating on `mounted` keeps the SSR and first client render identical so
  // hydration doesn't mismatch; the real state applies right after mount.
  const mounted = useMounted();
  const { data: session, isPending } = authClient.useSession();
  const requests = useFriendRequests();

  // Shared by the placeholder and the signed-in state so they occupy the
  // same geometry.
  const signedInGroupClass = clsx(
    "flex",
    direction === "col" ? "flex-col items-start gap-4" : "items-center gap-6",
  );

  if (!mounted || isPending) {
    // A div (not a span like the real states) because Skeleton renders a
    // div — the classes, not the wrapper tag, define the geometry.
    return (
      <div className={signedInGroupClass} aria-hidden>
        {PLACEHOLDER_WIDTHS.map(({ key, width }) => (
          // The desktop account control resolves to a 32px avatar; the
          // drawer keeps its text label and therefore its normal line box.
          <Skeleton
            key={key}
            rounded="rounded-full"
            className={clsx(
              key === "account" && direction === "row" ? "size-8" : ["my-0.5 h-4", width],
            )}
          />
        ))}
      </div>
    );
  }

  if (session) {
    const hasRequests = requests.userId === session.user.id && (requests.count ?? 0) > 0;
    const accountLabel = hasRequests ? "Account, pending friend requests" : "Account";
    return (
      <span className={signedInGroupClass}>
        <NavLink href="/?mode=climb" onClick={onNavigate}>
          Search
        </NavLink>
        <NavLink href="/climbs/new" onClick={onNavigate}>
          Add climb
        </NavLink>
        <NavLink href="/areas/new" onClick={onNavigate}>
          Add area
        </NavLink>
        <NavLink href={`/users/${session.user.id}`} hideWithin onClick={onNavigate}>
          My Journal
        </NavLink>
        {direction === "row" ? (
          <NavLink
            href="/account"
            aria-label={accountLabel}
            title={accountLabel}
            className="relative rounded-full no-underline"
            onClick={onNavigate}
          >
            <UserAvatar name={session.user.name} image={session.user.image} size="sm" />
            {hasRequests && <FriendRequestDot className="absolute top-0 right-0" />}
          </NavLink>
        ) : (
          <NavLink
            href="/account"
            aria-label={accountLabel}
            className="inline-flex items-center gap-1.5"
            onClick={onNavigate}
          >
            Account
            {hasRequests && <FriendRequestDot />}
          </NavLink>
        )}
      </span>
    );
  }

  return (
    <span
      className={clsx("flex gap-4", direction === "col" ? "flex-col items-start" : "items-center")}
    >
      <NavLink href="/sign-in" onClick={onNavigate}>
        Sign in
      </NavLink>
      <NavLink href="/sign-up" onClick={onNavigate}>
        Sign up
      </NavLink>
    </span>
  );
}
