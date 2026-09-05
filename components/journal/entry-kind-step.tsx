"use client";

import { Button } from "@heroui/react";
import { useState } from "react";

import { ClimbPicker } from "@/components/climb-picker";
import type { ClimbWithAreaName } from "@/db/queries";

export type EntryKindChoice =
  | { kind: "session"; climb: ClimbWithAreaName; hasPriorSend: boolean }
  | { kind: "training" };

const ENTRY_TYPES = [
  {
    id: "session",
    label: "Outdoor session",
    description: "One climb, one date — whether or not you sent.",
  },
  {
    id: "training",
    label: "Training",
    description: "Indoor climbing, strength, or conditioning.",
  },
] as const;

export function EntryKindStep({
  sentClimbIds,
  onChoose,
}: {
  sentClimbIds?: Set<number>;
  onChoose: (choice: EntryKindChoice) => void;
}) {
  const [choosingClimb, setChoosingClimb] = useState(false);

  if (choosingClimb) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-foreground">Choose a climb</p>
          <p className="text-sm text-muted">
            Log one climb at a time. You can record another entry for each climb you worked on.
          </p>
        </div>
        <ClimbPicker
          allowSentClimbs
          onPick={(climb, context) =>
            onChoose({ kind: "session", climb, hasPriorSend: context.sent })
          }
          sentClimbIds={sentClimbIds}
        />
        <Button size="sm" variant="ghost" onPress={() => setChoosingClimb(false)}>
          Back to entry type
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="font-medium text-foreground">What are you logging?</p>
        <p className="text-sm text-muted">Choose where the climbing happened.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {ENTRY_TYPES.map((choice) => (
          <button
            key={choice.id}
            type="button"
            onClick={() =>
              choice.id === "session" ? setChoosingClimb(true) : onChoose({ kind: "training" })
            }
            className="cursor-pointer rounded-inset border border-border px-4 py-4 text-left transition-colors hover:bg-surface-secondary/60 focus-visible:status-focused"
          >
            <span className="block font-medium text-foreground">{choice.label}</span>
            <span className="mt-1 block text-sm text-muted">{choice.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
