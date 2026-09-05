import { clsx } from "clsx";

import { cardClass } from "@/components/ui/card";

const TONE_CLASSNAME = {
  /** Sits directly on the page background. */
  base: "bg-surface-secondary",
  /** Sits inside a bg-surface-secondary panel — one surface step up so the
   * placeholder stays visible against the panel. */
  raised: "bg-surface-tertiary",
} as const;

type SkeletonProps = {
  className?: string;
  tone?: keyof typeof TONE_CLASSNAME;
  /** Corner radius utility — one of the three roles, matching whatever the
   * placeholder stands in for. A prop rather than part of `className`
   * because Tailwind's emission order, not source order, decides which of
   * two radius classes wins, so one passed alongside the default was lost. */
  rounded?: string;
};

/** Base pulsing placeholder block — size it via className (h-*, w-*). The
 * app's only skeleton; the header controls use it too, so every loading
 * surface pulses the same way. */
export function Skeleton({ className, tone = "base", rounded = "rounded-inset" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={clsx("animate-pulse", rounded, TONE_CLASSNAME[tone], className)}
    />
  );
}

/** Placeholder for a list of ListRow entries — mirrors its route-table
 * px-4 py-3 density and the divide-y separators the real lists use. */
export function SkeletonListRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col divide-y divide-separator">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 px-4 py-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder for a StatStrip card — the same card surface with
 * label/value line pairs inside. */
export function SkeletonStatCard({ stats = 3 }: { stats?: number }) {
  return (
    <div className={cardClass("sm")}>
      <div className="flex flex-col gap-3">
        {Array.from({ length: stats }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <Skeleton tone="raised" className="h-3 w-24" />
            <Skeleton tone="raised" className="h-4 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}
