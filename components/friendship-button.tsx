"use client";

import { useState, useTransition } from "react";

import {
  requestFriendship,
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  removeFriendship,
} from "@/actions";
import { useFriendRequests } from "@/components/friend-requests-provider";
import { FriendshipActionButton } from "@/components/friendship-action-button";
import { AppLink } from "@/components/ui/app-link";
import type { FriendshipStatus } from "@/lib/friendships";
import { signInUrl } from "@/lib/sign-in-redirect";

export function FriendshipButton({
  userId,
  name,
  initialStatus,
  signedIn,
}: {
  userId: string;
  name: string;
  initialStatus: FriendshipStatus;
  signedIn: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [source, setSource] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { refresh } = useFriendRequests();
  if (source !== initialStatus) {
    setSource(initialStatus);
    setStatus(initialStatus);
  }
  if (!signedIn)
    return <AppLink href={signInUrl(`/users/${userId}`)}>Sign in to add a friend</AppLink>;
  const options =
    status === "incoming"
      ? [
          { kind: "accept" as const, action: acceptFriendRequest },
          { kind: "decline" as const, action: declineFriendRequest },
        ]
      : status === "outgoing"
        ? [{ kind: "cancel" as const, action: cancelFriendRequest }]
        : status === "friends"
          ? [{ kind: "remove" as const, action: removeFriendship }]
          : [{ kind: "add" as const, action: requestFriendship }];
  return (
    <div className="flex flex-col gap-1">
      {status === "outgoing" && (
        <p role="status" className="text-xs text-muted">
          Friend request sent
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map(({ kind, action }) => (
          <FriendshipActionButton
            key={kind}
            action={kind}
            name={name}
            pending={pending}
            error={error}
            onPress={(complete) => {
              setError(null);
              startTransition(async () => {
                try {
                  const result = await action(userId);
                  if (result.ok) {
                    setStatus(result.value);
                    void refresh();
                    complete();
                  } else setError(result.error);
                } catch {
                  setError("Couldn't save that change. Try again.");
                }
              });
            }}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="max-w-64 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
