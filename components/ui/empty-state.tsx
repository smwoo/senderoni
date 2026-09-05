import { clsx } from "clsx";
import type { ReactNode } from "react";

type EmptyStateProps = {
  /** What's empty and why, in the interface's voice ("No sends yet."). */
  message: ReactNode;
  /** Optional invitation to act — a link or button that fills the emptiness
   * ("Log the first send"). */
  cta?: ReactNode;
  className?: string;
};

/** Shared empty state for lists and result panes: quiet, centered, and an
 * invitation to act when there's an action that fills it. */
export function EmptyState({ message, cta, className }: EmptyStateProps) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center gap-3 rounded-surface border border-dashed border-border px-6 py-10 text-center",
        className,
      )}
    >
      <p className="text-sm text-muted">{message}</p>
      {cta}
    </div>
  );
}
