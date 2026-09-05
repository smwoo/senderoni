"use client";

import { Button, Label, ListBox, Select, TextField } from "@heroui/react";
import { clsx } from "clsx";
import { Star } from "lucide-react";
import { useState, type ReactNode } from "react";

import { ASCENT_STYLE_CHIP_CLASSNAME, ASCENT_STYLE_LABELS } from "@/components/ascent-style";
import { choicePillClass } from "@/components/ui/choice-pill";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SegmentedButtons } from "@/components/ui/segmented-buttons";
import { nativeGradeArray, type ClimbType } from "@/lib/grades";
import { ASCENT_STYLES, GRADE_FEEL_VALUES, type AscentStyle, type GradeFeel } from "@/lib/sends";

export function FormSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <Eyebrow>{label}</Eyebrow>
      {children}
    </section>
  );
}

export const GRADE_FEEL_LABELS: Record<GradeFeel, string> = {
  low: "Low end",
  solid: "Solid",
  high: "High end",
};

const GRADE_FEEL_OPTIONS = GRADE_FEEL_VALUES.map((value) => ({
  value,
  label: GRADE_FEEL_LABELS[value],
}));

export function AscentStylePicker({
  value,
  onChange,
}: {
  value: AscentStyle;
  onChange: (value: AscentStyle) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Ascent style" className="flex flex-wrap gap-1.5">
      {ASCENT_STYLES.map((style) => {
        const selected = value === style;
        return (
          <button
            key={style}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(style)}
            className={choicePillClass(selected, ASCENT_STYLE_CHIP_CLASSNAME[style])}
          >
            {ASCENT_STYLE_LABELS[style]}
          </button>
        );
      })}
    </div>
  );
}

const RATING_VALUES = [1, 2, 3, 4, 5];

function RatingPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? value ?? 0;

  return (
    <div
      role="radiogroup"
      aria-label="Rating"
      className="-ml-1 flex items-center"
      onMouseLeave={() => setHovered(null)}
    >
      {RATING_VALUES.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          onFocus={() => setHovered(n)}
          onBlur={() => setHovered(null)}
          className="cursor-pointer rounded-inset p-1 transition-colors focus-visible:status-focused"
        >
          <Star
            className={clsx(
              "size-7 transition-colors",
              n <= shown ? "fill-current text-warning" : "text-muted",
            )}
          />
        </button>
      ))}
    </div>
  );
}

export function RatingField({
  value,
  onValueChange,
}: {
  value: number | null;
  onValueChange: (value: number | null) => void;
}) {
  return (
    <TextField>
      <Label>Rating</Label>
      <RatingPicker value={value} onChange={onValueChange} />
      <Button
        size="sm"
        variant="ghost"
        className="mt-2 self-start"
        isDisabled={value === null}
        onPress={() => onValueChange(null)}
      >
        Clear rating
      </Button>
    </TextField>
  );
}

export function SuggestedGradeField({
  climbType,
  value,
  onChange,
}: {
  climbType: ClimbType;
  value: string;
  onChange: (value: string) => void;
}) {
  const gradeOptions = nativeGradeArray(climbType);

  return (
    <TextField>
      <Label>Suggested grade</Label>
      <Select
        aria-label="Suggested grade"
        fullWidth
        selectedKey={value || "none"}
        onSelectionChange={(key) => onChange(key === "none" ? "" : String(key))}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox className="max-h-64 overflow-y-auto">
            <ListBox.Item id="none">No suggested grade</ListBox.Item>
            {gradeOptions.map((label, i) => (
              <ListBox.Item key={label} id={String(i)}>
                {label}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </TextField>
  );
}

export function GradeFeelField({
  value,
  onChange,
}: {
  value: GradeFeel;
  onChange: (value: GradeFeel) => void;
}) {
  return (
    <TextField>
      <Label>Grade feel</Label>
      <SegmentedButtons value={value} onChange={onChange} options={GRADE_FEEL_OPTIONS} />
    </TextField>
  );
}
