"use client";

import { Button } from "@heroui/react";
import { useState } from "react";

export function ShareProfileButton({ userId }: { userId: string }) {
  const [message, setMessage] = useState("");
  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        variant="secondary"
        onPress={async () => {
          try {
            await navigator.clipboard.writeText(
              new URL(`/users/${userId}`, window.location.origin).href,
            );
            setMessage("Profile link copied");
          } catch {
            setMessage("Copy the link from your profile's address bar.");
          }
        }}
      >
        Copy profile link
      </Button>
      <span role="status" className="text-xs text-muted">
        {message}
      </span>
    </div>
  );
}
