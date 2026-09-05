"use client";

import { Button } from "@heroui/react";
import { useState } from "react";

import { EntryKindStep, type EntryKindChoice } from "@/components/journal/entry-kind-step";
import { JournalEntryForm } from "@/components/journal/journal-entry-form";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { Grade } from "@/components/ui/grade";
import type { ClimbWithAreaName } from "@/db/queries";
import { formatGrade } from "@/lib/grades";

function ChosenStrip({
  choice,
  onChange,
  pending,
}: {
  choice: EntryKindChoice;
  onChange: () => void;
  pending: boolean;
}) {
  const climb = choice.kind === "session" ? choice.climb : undefined;

  return (
    <div className="flex items-center justify-between gap-3 rounded-inset bg-surface-secondary px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {climb ? climb.name : "Training"}
        </p>
        <p className="truncate text-xs text-muted">
          {climb ? climb.areaName : "Indoor climbing, strength, or conditioning"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {climb && (
          <>
            <DisciplineChip type={climb.type} />
            <Grade>{formatGrade(climb.type, climb.grade)}</Grade>
          </>
        )}
        <Button size="sm" variant="ghost" onPress={onChange} isDisabled={pending}>
          Change
        </Button>
      </div>
    </div>
  );
}

export function JournalEntryComposer({
  sentClimbIds,
  onDone,
}: {
  sentClimbIds?: Set<number>;
  onDone: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [choice, setChoice] = useState<EntryKindChoice | null>(null);

  if (!choice) {
    return <EntryKindStep sentClimbIds={sentClimbIds} onChoose={setChoice} />;
  }

  const climb: ClimbWithAreaName | undefined = choice.kind === "session" ? choice.climb : undefined;

  return (
    <div className="flex flex-col gap-4">
      <ChosenStrip choice={choice} onChange={() => setChoice(null)} pending={pending} />
      <JournalEntryForm
        kind={choice.kind}
        climb={climb}
        hasPriorSend={choice.kind === "session" ? choice.hasPriorSend : false}
        onDone={onDone}
        onPendingChange={setPending}
      />
    </div>
  );
}
