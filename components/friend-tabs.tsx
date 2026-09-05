"use client";

import { useEffect, useRef } from "react";

import { FriendRequestBadge } from "@/components/friend-request-badge";
import { useFriendRequests } from "@/components/friend-requests-provider";
import { ProfileSectionNav } from "@/components/profile-tabs";

export function FriendTabs({ requestsOnly, userId }: { requestsOnly: boolean; userId: string }) {
  const requests = useFriendRequests();
  const previousView = useRef(requestsOnly);
  useEffect(() => {
    if (previousView.current !== requestsOnly) {
      previousView.current = requestsOnly;
      void requests.refresh();
    }
  }, [requestsOnly, requests]);

  return (
    <ProfileSectionNav
      label="Friend lists"
      tabs={[
        { href: "/friends", label: "All friends", current: !requestsOnly },
        {
          href: "/friends?view=requests",
          label: "Requests",
          current: requestsOnly,
          badge: <FriendRequestBadge count={requests.userId === userId ? requests.count : null} />,
        },
      ]}
    />
  );
}
