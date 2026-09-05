"use client";

import { useState, useTransition } from "react";

import { setJournalVisibility, setUserPrivate } from "@/actions";
import { PrivacyFields } from "@/components/privacy-fields";
import { AppLink } from "@/components/ui/app-link";
import type { JournalVisibility } from "@/lib/journal";

export function PrivacyControls({
  initialIsPrivate,
  initialJournalVisibility,
}: {
  initialIsPrivate: boolean;
  initialJournalVisibility: JournalVisibility;
}) {
  const [isPrivate, setIsPrivate] = useState(initialIsPrivate);
  const [journalVisibility, setJournalVisibilityState] =
    useState<JournalVisibility>(initialJournalVisibility);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleProfileChange(next: boolean) {
    setIsPrivate(next);
    setProfileError(null);
    startTransition(async () => {
      try {
        const result = await setUserPrivate(next);
        if (!result.ok) {
          setIsPrivate(!next);
          setProfileError(result.error);
        }
      } catch {
        setIsPrivate(!next);
        setProfileError("Couldn't save profile privacy. Try again.");
      }
    });
  }

  function handleJournalChange(next: JournalVisibility) {
    const previous = journalVisibility;
    setJournalVisibilityState(next);
    setJournalError(null);
    startTransition(async () => {
      try {
        const result = await setJournalVisibility(next);
        if (!result.ok) {
          setJournalVisibilityState(previous);
          setJournalError(result.error);
        }
      } catch {
        setJournalVisibilityState(previous);
        setJournalError("Couldn't save your journal privacy setting. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PrivacyFields
        isPrivate={isPrivate}
        journalVisibility={journalVisibility}
        onProfileChange={handleProfileChange}
        onJournalChange={handleJournalChange}
        isPending={isPending}
        profileError={profileError}
        journalError={journalError}
        profileDescription="Hides your profile, sends, journal, and analytics from everyone but you. Sends still count toward community ratings. Your friends and people you send requests to can still see your name in Friends."
        journalDescription={
          isPrivate
            ? "Only you can read your journal and notes while your profile is private. This setting applies if you make your profile public."
            : "Choose who can read your journal and send notes, including past entries. You become friends when either of you accepts a friend request. Your sends are still public."
        }
      />
      <AppLink href="/friends">Manage friends and requests</AppLink>
    </div>
  );
}
