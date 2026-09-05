import { clsx } from "clsx";

import { DISCIPLINE_HUE } from "@/components/ui/discipline-chip";
import type { LoggedGradeRow } from "@/lib/grade-histogram";
import type { ClimbType } from "@/lib/grades";
import type { GradeFeel } from "@/lib/sends";

// Feel is ordinal, so the shade carries the meaning: lighter = felt soft,
// darker = felt hard. Three fixed steps of one hue, legible on both themes.
const FEEL_ORDER: GradeFeel[] = ["low", "solid", "high"];
const FEEL_OPACITY: Record<GradeFeel, number> = { low: 0.35, solid: 0.65, high: 1 };
const FEEL_LABEL: Record<GradeFeel, string> = {
  low: "felt soft",
  solid: "solid",
  high: "felt hard",
};

/** The community's grading of one climb: one bar per suggested grade, in
 * grade order, sized by vote share — with each bar shaded soft → hard by
 * how the grade felt, and the exact feel counts revealed on hover. Read
 * against the posted grade, which is marked even when nobody voted for it. */
export function LoggedGradeHistogram({ type, rows }: { type: ClimbType; rows: LoggedGradeRow[] }) {
  const voted = rows.filter((row) => row.total > 0);
  if (voted.length === 0) return null;

  const totalVotes = voted.reduce((sum, row) => sum + row.total, 0);
  const maxVotes = Math.max(...voted.map((row) => row.total));
  const hue = DISCIPLINE_HUE[type];
  const hasFeelSplit = voted.some((row) => row.feelCounts.low > 0 || row.feelCounts.high > 0);

  const summary = voted
    .map((row) => {
      const feels = FEEL_ORDER.filter((feel) => row.feelCounts[feel] > 0)
        .map((feel) => `${row.feelCounts[feel]} ${FEEL_LABEL[feel]}`)
        .join(", ");
      return `${row.total} at ${row.label} (${feels})`;
    })
    .join("; ");
  const posted = rows.find((row) => row.isPosted);

  return (
    <div className="flex flex-col gap-2.5">
      <p className="sr-only">
        Logged grades: {summary}.{posted ? ` Posted grade: ${posted.label}.` : ""}
      </p>
      <div className="flex flex-col gap-2 text-xs tabular-nums" aria-hidden>
        {rows.map((row, i) => {
          const breakdown = FEEL_ORDER.filter((feel) => row.feelCounts[feel] > 0)
            .map((feel) => `${row.feelCounts[feel]} ${FEEL_LABEL[feel]}`)
            .join(" · ");
          return (
            <div key={row.label} className="group flex items-center gap-3">
              <span
                className={clsx(
                  "w-11 shrink-0 text-foreground",
                  row.isPosted && "font-semibold underline underline-offset-2",
                )}
              >
                {row.label}
              </span>
              {row.total > 0 ? (
                <>
                  <div className="relative flex-1">
                    <div
                      className="flex h-3 gap-px overflow-hidden rounded-xs motion-safe:animate-bar-grow-x"
                      style={{
                        width: `${(row.total / maxVotes) * 100}%`,
                        animationDelay: `${i * 15}ms`,
                      }}
                    >
                      {FEEL_ORDER.filter((feel) => row.feelCounts[feel] > 0).map((feel) => (
                        <div
                          key={feel}
                          className="h-full"
                          style={{
                            flexGrow: row.feelCounts[feel],
                            backgroundColor: hue,
                            opacity: FEEL_OPACITY[feel],
                          }}
                        />
                      ))}
                    </div>
                    <span className="pointer-events-none absolute -top-7 left-0 z-10 hidden rounded-inset border border-separator bg-surface px-2 py-1 text-[11px] whitespace-nowrap shadow-sm group-hover:block">
                      {breakdown}
                    </span>
                  </div>
                  <span className="w-14 shrink-0 text-right text-muted">
                    {Math.round((row.total / totalVotes) * 100)}% · {row.total}
                  </span>
                </>
              ) : (
                <span className="text-muted">posted · no votes</span>
              )}
            </div>
          );
        })}
      </div>
      {hasFeelSplit && (
        <p className="flex items-center gap-3 text-[11px] text-muted" aria-hidden>
          {FEEL_ORDER.map((feel) => (
            <span key={feel} className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-xs"
                style={{ backgroundColor: hue, opacity: FEEL_OPACITY[feel] }}
              />
              {FEEL_LABEL[feel]}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
