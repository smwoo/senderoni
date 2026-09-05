export type Step = "upload" | "columns" | "values" | "match" | "review" | "result";

/** The user-visible stations of the wizard, in order — "result" renders as
 * every station done. */
const WIZARD_STATIONS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "columns", label: "Columns" },
  { key: "values", label: "Values" },
  { key: "match", label: "Climbs" },
  { key: "review", label: "Review" },
];

export function WizardSteps({
  step,
  onJump,
}: {
  step: Step;
  onJump: ((step: Step) => void) | null;
}) {
  const activeIndex =
    step === "result" ? WIZARD_STATIONS.length : WIZARD_STATIONS.findIndex((s) => s.key === step);

  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
      {WIZARD_STATIONS.map((station, i) => {
        const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "todo";
        const label = `${i + 1} ${station.label}`;
        return (
          <li key={station.key} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-4 bg-separator" aria-hidden />}
            {state === "done" && onJump ? (
              // A finished step is a way back — the same navigation the Back
              // buttons offer, without walking through each step in between.
              <button
                type="button"
                onClick={() => onJump(station.key)}
                className="cursor-pointer rounded-inset px-1.5 py-0.5 text-success-soft-foreground hover:text-foreground focus-visible:status-focused"
              >
                {label}
              </button>
            ) : (
              <span
                aria-current={state === "active" ? "step" : undefined}
                className={
                  state === "active"
                    ? "rounded-inset border border-border bg-surface px-1.5 py-0.5 font-medium text-foreground"
                    : state === "done"
                      ? "px-1.5 py-0.5 text-success-soft-foreground"
                      : "px-1.5 py-0.5 text-muted"
                }
              >
                {label}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
