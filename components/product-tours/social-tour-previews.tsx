"use client";

import { useState } from "react";

import { FriendRequestBadge } from "@/components/friend-request-badge";
import { FriendshipActionButton } from "@/components/friendship-action-button";
import { ProfileSectionNav } from "@/components/profile-tabs";
import { choicePillClass } from "@/components/ui/choice-pill";
import { ListRow } from "@/components/ui/list-row";
import { SectionHeading } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatDate } from "@/lib/format-date";
import { TOUR_DEMO_FRIEND_DAY, TOUR_DEMO_PEOPLE } from "@/lib/product-tour-demo";

/** Sample interactions stay in this component; no friendship actions or profile links. */
export function DemoFriends({
  incoming,
  onIncomingChange,
}: {
  incoming: "pending" | "accepted" | null;
  onIncomingChange: (value: "pending" | "accepted" | null) => void;
}) {
  const [view, setView] = useState<"friends" | "requests">("requests");
  const showPerson = view === "requests" ? incoming === "pending" : incoming === "accepted";
  return (
    <div className="flex w-full flex-col gap-6">
      <section
        data-tour-target="friend-requests"
        aria-label="Friends"
        className="flex flex-col gap-3"
      >
        <SectionHeading>Friends</SectionHeading>
        <ProfileSectionNav
          label="Friend lists"
          tabs={[
            {
              label: "All friends",
              current: view === "friends",
              onSelect: () => setView("friends"),
            },
            {
              label: "Requests",
              current: view === "requests",
              onSelect: () => setView("requests"),
              badge: <FriendRequestBadge count={incoming === "pending" ? 1 : 0} />,
            },
          ]}
        />
        {showPerson ? (
          <article className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3">
              <UserAvatar name={TOUR_DEMO_PEOPLE.requester} size="sm" />
              <div>
                <h3 className="font-semibold">{TOUR_DEMO_PEOPLE.requester}</h3>
                <p role="status" className="text-sm text-muted">
                  {incoming === "accepted" ? "Friends" : "Wants to be friends"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {incoming === "pending" ? (
                <>
                  <FriendshipActionButton
                    action="accept"
                    name={TOUR_DEMO_PEOPLE.requester}
                    onPress={(complete) => {
                      onIncomingChange("accepted");
                      complete();
                    }}
                  />
                  <FriendshipActionButton
                    action="decline"
                    name={TOUR_DEMO_PEOPLE.requester}
                    onPress={(complete) => {
                      onIncomingChange(null);
                      complete();
                    }}
                  />
                </>
              ) : (
                <FriendshipActionButton
                  action="remove"
                  name={TOUR_DEMO_PEOPLE.requester}
                  onPress={(complete) => {
                    onIncomingChange(null);
                    complete();
                  }}
                />
              )}
            </div>
          </article>
        ) : (
          <p role="status" className="text-sm text-muted">
            {view === "requests" ? "No pending friend requests." : "No friends yet."}
          </p>
        )}
      </section>
    </div>
  );
}

export function DemoFeed() {
  const [view, setView] = useState<"All" | "Sends">("All");
  const day = TOUR_DEMO_FRIEND_DAY;
  const entries = day.entries.filter((entry) => view === "All" || entry.outcome === "Sent");
  return (
    <section aria-label="Friends' activity" className="flex w-full flex-col gap-3">
      <SectionHeading>Feed</SectionHeading>
      <div data-tour-target="friend-feed" className="flex flex-col gap-3">
        <div role="group" aria-label="Feed activity" className="flex gap-2">
          {(["All", "Sends"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              className={choicePillClass(view === option, "bg-foreground text-background")}
              onClick={() => setView(option)}
            >
              {option === "All" ? "All activity" : option}
            </button>
          ))}
        </div>
        <article className="overflow-hidden rounded-lg border border-separator bg-surface">
          <header className="flex items-center gap-3 border-b border-separator px-4 py-4">
            <UserAvatar name={day.name} size="sm" />
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold">{day.name}</h3>
              <p role="status" className="text-sm text-muted">
                {view === "All" ? "1 send · 1 session · 1 training entry" : "1 send"}
              </p>
            </div>
            <time dateTime={day.date} className="shrink-0 text-xs text-muted">
              {formatDate(day.date)}
            </time>
          </header>
          <div className="divide-y divide-separator">
            {entries.map((entry) => (
              <ListRow
                key={entry.id}
                title={entry.climb?.name ?? "Training"}
                subtitle={entry.outcome === "Session" ? "Climbed on" : entry.outcome}
                meta={entry.climb?.grade}
                comment={entry.note}
              />
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
