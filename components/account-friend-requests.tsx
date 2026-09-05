"use client";

import { buttonVariants } from "@heroui/react";

import { FriendRequestDot } from "@/components/friend-request-badge";
import { useFriendRequests } from "@/components/friend-requests-provider";
import { AppLink } from "@/components/ui/app-link";

export function AccountFriendRequests({ userId }: { userId: string }) {
  const requests = useFriendRequests();
  if (requests.userId !== userId || !requests.count) return null;
  return (
    <AppLink
      href="/friends?view=requests"
      className={`${buttonVariants({ variant: "outline" })} gap-2 text-foreground`}
    >
      <FriendRequestDot />
      Review friend requests
    </AppLink>
  );
}
