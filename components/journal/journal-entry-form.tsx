"use client";

import { Button, Checkbox, Label, TextArea, TextField } from "@heroui/react";
import { useState, useTransition } from "react";

import { createJournalEntry, createUndatedSend, updateJournalEntry } from "@/actions";
import { TagInput } from "@/components/journal/tag-input";
import {
  AscentStylePicker,
  FormSection,
  GradeFeelField,
  RatingField,
  SuggestedGradeField,
} from "@/components/send-fields";
import { AppLink } from "@/components/ui/app-link";
import { SURFACE_CARD_CLASS } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import type { JournalEntry, SendableClimb } from "@/db/queries";
import { GENERIC_ERROR_MESSAGE } from "@/lib/action-result";
import { MAX_JOURNAL_BODY_LENGTH, type JournalKind } from "@/lib/journal";
import type { AscentStyle, GradeFeel } from "@/lib/sends";

type JournalEntryFormProps = {
  kind: JournalKind;
  climb?: (SendableClimb & { name: string }) | null;
  hasPriorSend?: boolean;
  existingEntry?: JournalEntry;
  onDone?: () => void;
  onPendingChange?: (pending: boolean) => void;
};

function describePendingEntry(input: {
  kind: JournalKind;
  climbName?: string | null;
  sent: boolean;
  hasPriorSend: boolean;
}): { headline: string; consequence: string | null } {
  if (input.kind === "training") {
    return { headline: "Logging training.", consequence: null };
  }

  const climb = input.climbName?.trim();
  if (!climb) return { headline: "Logging an outdoor session.", consequence: null };

  if (!input.sent) {
    return { headline: `Logging an outdoor session on ${climb}.`, consequence: null };
  }

  if (input.hasPriorSend) {
    return {
      headline: `Logging a repeat of ${climb}.`,
      consequence: `Your ascent of ${climb} is already recorded — a repeat doesn't change it.`,
    };
  }

  return {
    headline: `Logging an ascent of ${climb}.`,
    consequence: `Records a send on ${climb}, counting toward its send total and grade consensus.`,
  };
}

// oxlint-disable-next-line complexity
export function JournalEntryForm({
  kind,
  climb,
  hasPriorSend = false,
  existingEntry,
  onDone,
  onPendingChange,
}: JournalEntryFormProps) {
  const today = new Intl.DateTimeFormat("en-CA").format(new Date());

  const [entryDate, setEntryDate] = useState(existingEntry?.entryDate ?? today);
  const [dateUnknown, setDateUnknown] = useState(false);
  const [sent, setSent] = useState(existingEntry?.sent ?? false);
  const [body, setBody] = useState(existingEntry?.body ?? "");
  const [tags, setTags] = useState<string[]>(existingEntry?.tags ?? []);

  const [ascentStyle, setAscentStyle] = useState<AscentStyle>("redpoint");
  const [rating, setRating] = useState<number | null>(null);
  const [suggestedGrade, setSuggestedGrade] = useState(String(climb?.grade ?? ""));
  const [gradeFeel, setGradeFeel] = useState<GradeFeel>("solid");

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isAscent = !existingEntry && sent && climb != null && !hasPriorSend;
  const isUndatedSend = isAscent && dateUnknown;
  const summary = describePendingEntry({ kind, climbName: climb?.name, sent, hasPriorSend });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);

    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("entryDate", entryDate);
    formData.set("body", body);
    if (climb) formData.set("climbId", String(climb.id));
    if (sent) formData.set("sent", "true");
    if (!isUndatedSend) {
      for (const tag of tags) formData.append("tag", tag);
    }

    if (isAscent) {
      formData.set("ascentStyle", ascentStyle);
      formData.set("rating", rating == null ? "" : String(rating));
      formData.set("suggestedGrade", suggestedGrade);
      formData.set("gradeFeel", gradeFeel);
    }
    if (isUndatedSend) {
      formData.set("dateSent", "");
      formData.set("comment", body);
    }

    onPendingChange?.(true);
    startTransition(async () => {
      try {
        const result = existingEntry
          ? await updateJournalEntry(existingEntry.id, formData)
          : isUndatedSend
            ? await createUndatedSend(formData)
            : await createJournalEntry(formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onDone?.();
      } catch {
        setError(GENERIC_ERROR_MESSAGE);
      } finally {
        onPendingChange?.(false);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className={`${SURFACE_CARD_CLASS} gap-6`}>
      <FormSection label="The day">
        {!isUndatedSend && (
          <DatePickerField
            label="Date"
            value={entryDate}
            max={today}
            isReadOnly={existingEntry?.sent}
            onChange={setEntryDate}
          />
        )}

        {isAscent && (
          <Checkbox isSelected={dateUnknown} onChange={setDateUnknown}>
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              I don&apos;t remember the date
            </Checkbox.Content>
          </Checkbox>
        )}

        {climb &&
          (existingEntry ? (
            sent && (
              <p className="text-sm text-muted">
                {existingEntry.isAscent
                  ? "To change the ascent date, use Edit send on the climb page."
                  : "To change this repeat’s date, delete the entry and log it again."}
              </p>
            )
          ) : (
            <Checkbox isSelected={sent} onChange={setSent}>
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                I sent
              </Checkbox.Content>
            </Checkbox>
          ))}
      </FormSection>

      {isAscent && climb && (
        <FormSection label="The ascent">
          <AscentStylePicker value={ascentStyle} onChange={setAscentStyle} />
          <div className="grid gap-4 sm:grid-cols-2">
            <RatingField value={rating} onValueChange={setRating} />
            <SuggestedGradeField
              climbType={climb.type}
              value={suggestedGrade}
              onChange={setSuggestedGrade}
            />
          </div>
          <GradeFeelField value={gradeFeel} onChange={setGradeFeel} />
        </FormSection>
      )}

      <FormSection label="Notes">
        <TextField value={body} onChange={setBody}>
          <Label>{kind === "training" ? "What did you do?" : "How'd it go?"}</Label>
          <TextArea
            maxLength={MAX_JOURNAL_BODY_LENGTH}
            placeholder={
              kind === "training"
                ? "Climbs, drills, sets, weights, how it felt…"
                : "Conditions, beta, how it felt…"
            }
          />
          <p className="mt-1 text-xs text-muted">
            {MAX_JOURNAL_BODY_LENGTH - body.length} characters left
          </p>
        </TextField>

        {(isAscent || existingEntry?.isAscent) && (
          <p className="text-xs text-muted">
            This note also appears on your send and uses your journal privacy setting.
          </p>
        )}
        {!isUndatedSend && <TagInput value={tags} onChange={setTags} />}
      </FormSection>

      {!existingEntry && (
        <div className="flex flex-col gap-1 rounded-lg bg-surface-secondary px-4 py-3">
          <p className="text-sm font-medium text-foreground">{summary.headline}</p>
          {summary.consequence && <p className="text-sm text-muted">{summary.consequence}</p>}
          {isUndatedSend && (
            <p className="text-sm text-muted">
              Saved in your logbook with Date unknown. Add a date later to include it in your
              journal. Journal tags require a date.
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Button type="submit" isDisabled={pending} fullWidth>
        {existingEntry ? "Save changes" : isUndatedSend ? "Save send" : "Save entry"}
      </Button>

      <p className="text-center text-xs text-muted">
        Choose who can read your journal and notes in{" "}
        <AppLink href="/account">Account settings</AppLink>.
      </p>
    </form>
  );
}
