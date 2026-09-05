"use client";

import { Switch, Select, ListBox } from "@heroui/react";

import type { JournalVisibility } from "@/lib/journal";

const audiences: { value: JournalVisibility; label: string }[] = [
  { value: "private", label: "Only me" },
  { value: "friends", label: "Friends" },
  { value: "public", label: "Public" },
];

/** Controlled fields shared by Account and the local tutorial example. Saving belongs to the caller. */
export function PrivacyFields({
  isPrivate,
  journalVisibility,
  onProfileChange,
  onJournalChange,
  isPending = false,
  profileDescription,
  journalDescription,
  profileError,
  journalError,
}: {
  isPrivate: boolean;
  journalVisibility: JournalVisibility;
  onProfileChange: (value: boolean) => void;
  onJournalChange: (value: JournalVisibility) => void;
  isPending?: boolean;
  profileDescription?: string;
  journalDescription?: string;
  profileError?: string | null;
  journalError?: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Switch isDisabled={isPending} isSelected={isPrivate} onChange={onProfileChange}>
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            Private profile
          </Switch.Content>
        </Switch>
        {profileDescription && <p className="text-xs text-muted">{profileDescription}</p>}
        {profileError && (
          <p role="alert" className="text-sm text-danger">
            {profileError}
          </p>
        )}
      </div>
      <div
        className={`flex flex-col gap-1 ${journalDescription ? "border-t border-border pt-4" : ""}`}
      >
        <p className="font-medium">Journal and notes</p>
        <Select
          aria-label="Journal privacy"
          selectedKey={journalVisibility}
          isDisabled={isPending}
          onSelectionChange={(key) => {
            const audience = audiences.find((option) => option.value === key);
            if (audience) onJournalChange(audience.value);
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {audiences.map(({ value, label }) => (
                <ListBox.Item key={value} id={value} textValue={label}>
                  {label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        {journalDescription && <p className="text-xs text-muted">{journalDescription}</p>}
        {journalError && (
          <p role="alert" className="text-sm text-danger">
            {journalError}
          </p>
        )}
      </div>
    </div>
  );
}
