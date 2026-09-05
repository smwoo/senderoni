import { clsx } from "clsx";

import { AppLink } from "@/components/ui/app-link";

export type SearchMode = "climb" | "area" | "climber";

type SearchModeSwitchProps = { mode: SearchMode } & (
  | { hrefFor: (mode: SearchMode) => string; onSelect?: never }
  | { onSelect: (mode: SearchMode) => void; hrefFor?: never }
);

/** The search page supplies links; tutorial selections stay in local state. */
export function SearchModeSwitch({ mode, hrefFor, onSelect }: SearchModeSwitchProps) {
  return (
    <div
      role="group"
      aria-label="Search category"
      className="inline-flex max-w-full flex-wrap gap-1 self-start rounded-2xl bg-surface-secondary p-1"
    >
      {(["climb", "area", "climber"] as const).map((target) => {
        const active = mode === target;
        const label = `Search ${target}s`;
        const className = clsx(
          "rounded-full px-4 py-1.5 text-sm no-underline",
          active ? "bg-segment font-semibold text-segment-foreground" : "text-muted",
        );
        return hrefFor ? (
          <AppLink
            key={target}
            href={hrefFor(target)}
            className={className}
            aria-current={active ? "page" : undefined}
          >
            {label}
          </AppLink>
        ) : (
          <button
            key={target}
            type="button"
            className={className}
            aria-pressed={active}
            onClick={() => onSelect(target)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
