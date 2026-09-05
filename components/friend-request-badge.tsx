import { formatCount } from "@/lib/format";

export function FriendRequestDot({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`size-2.5 shrink-0 rounded-full border-2 border-background bg-danger ${className}`}
    />
  );
}

export function FriendRequestBadge({ count }: { count: number | null }) {
  if (!count || count < 1) return null;
  return (
    <span
      role="status"
      aria-label={formatCount(count, "pending friend request")}
      className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-accent-foreground"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
