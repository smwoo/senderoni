import { formatCount } from "@/lib/format";
import { formatDate } from "@/lib/format-date";

const MS_PER_DAY = 86_400_000;
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

// Empty day → faint foreground tint; active days step up through the scope
// hue. Quartiles of the year's busiest day, so a heavy year doesn't wash
// out a light one.
const LEVEL_OPACITY = [0, 0.35, 0.55, 0.75, 1] as const;

export function ClimbingCalendar({
  countsByDay,
  year,
  hue,
  unit,
}: {
  countsByDay: Record<string, number>;
  year: number;
  hue: string;
  unit: "send" | "session";
}) {
  // oxlint-disable-next-line react/capitalized-calls -- Date.UTC is standard JavaScript built-in
  const jan1 = Date.UTC(year, 0, 1);
  // oxlint-disable-next-line react/capitalized-calls -- Date.UTC is standard JavaScript built-in
  const daysInYear = Math.round((Date.UTC(year + 1, 0, 1) - jan1) / MS_PER_DAY);
  // Monday-first rows, like a paper calendar.
  const offset = (new Date(jan1).getUTCDay() + 6) % 7;
  const weeks = Math.ceil((offset + daysInYear) / 7);

  const days = Array.from({ length: daysInYear }, (_, i) => {
    const iso = new Date(jan1 + i * MS_PER_DAY).toISOString().slice(0, 10);
    return { iso, count: countsByDay[iso] ?? 0 };
  });
  const max = Math.max(...days.map((day) => day.count), 1);
  const level = (count: number) => (count === 0 ? 0 : Math.max(1, Math.ceil((count / max) * 4)));

  const monthLabels = MONTHS_SHORT.map((label, month) => ({
    label,
    column: Math.floor((offset + Math.round((Date.UTC(year, month, 1) - jan1) / MS_PER_DAY)) / 7),
  }));

  const daysOut = days.filter((day) => day.count > 0).length;

  return (
    <div>
      <p className="sr-only">
        {formatCount(daysOut, "climbing day")} in {year}.
      </p>
      {/* Fluid squares: columns stretch to fill the card on wide screens
          (no dead space right of December) and bottom out at 10px, where
          the whole grid scrolls sideways instead of shrinking further. */}
      <div className="overflow-x-auto" aria-hidden>
        <div className="flex min-w-[720px] flex-col gap-1.5 pb-1">
          <div
            className="ml-9 grid gap-[3px] text-[10px] whitespace-nowrap text-muted"
            style={{ gridTemplateColumns: `repeat(${weeks}, minmax(10px, 1fr))` }}
          >
            {monthLabels.map(({ label, column }) => (
              <span key={label} style={{ gridColumnStart: column + 1 }}>
                {label}
              </span>
            ))}
          </div>
          <div className="flex gap-1.5">
            <div
              className="grid w-[30px] shrink-0 gap-[3px] text-[10px] leading-none text-muted"
              style={{ gridTemplateRows: "repeat(7, 1fr)" }}
            >
              <span className="self-center" style={{ gridRowStart: 1 }}>
                Mon
              </span>
              <span className="self-center" style={{ gridRowStart: 3 }}>
                Wed
              </span>
              <span className="self-center" style={{ gridRowStart: 5 }}>
                Fri
              </span>
            </div>
            <div
              className="grid min-w-0 flex-1 grid-flow-col gap-[3px]"
              style={{
                gridTemplateRows: "repeat(7, auto)",
                gridTemplateColumns: `repeat(${weeks}, minmax(10px, 1fr))`,
              }}
            >
              {Array.from({ length: offset }, (_, i) => (
                <span key={`pad-${i}`} />
              ))}
              {days.map((day) => (
                <span
                  key={day.iso}
                  title={`${day.count > 0 ? formatCount(day.count, unit) : `No ${unit}s`} · ${formatDate(day.iso)}`}
                  className="aspect-square w-full rounded-xs bg-foreground/10"
                  style={
                    day.count > 0
                      ? { backgroundColor: hue, opacity: LEVEL_OPACITY[level(day.count)] }
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
          <div className="mt-1 ml-9 flex items-center gap-1 text-[10px] text-muted">
            Less
            {LEVEL_OPACITY.map((opacity) => (
              <span
                key={opacity}
                className="size-[10px] rounded-xs bg-foreground/10"
                style={opacity > 0 ? { backgroundColor: hue, opacity } : undefined}
              />
            ))}
            More
          </div>
        </div>
      </div>
    </div>
  );
}
