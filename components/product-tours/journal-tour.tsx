"use client";

import { buttonVariants } from "@heroui/react";
import { CirclePlus } from "lucide-react";
import { useState } from "react";

import { FriendRequestBadge } from "@/components/friend-request-badge";
import { DemoClimberSearch } from "@/components/product-tours/climber-search-preview";
import {
  DemoAccount,
  DemoAnalytics,
  DemoJournal,
  DemoProjects,
  DemoSends,
} from "@/components/product-tours/profile-tour-previews";
import { DemoFeed, DemoFriends } from "@/components/product-tours/social-tour-previews";
import type { ProductTourPageProps } from "@/components/product-tours/types";
import { ProfileHeading } from "@/components/profile-heading";
import { ProfileSectionNav } from "@/components/profile-tabs";
import { cardClass } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SidebarLayout } from "@/components/ui/page-shell";
import { StatStrip } from "@/components/ui/stat-strip";
import { SectionHeading } from "@/components/ui/typography";
import {
  TOUR_DEMO_ANALYTICS,
  TOUR_DEMO_CLIMBER,
  TOUR_DEMO_ENTRIES,
  TOUR_DEMO_SENDS,
} from "@/lib/product-tour-demo";

/** A visual reference to the app's entry point, without a demo action. */
function DemoLog() {
  return (
    <span
      data-tour-target="journal-log"
      className={`${buttonVariants()} w-fit cursor-default gap-2`}
    >
      <CirclePlus aria-hidden className="size-5" />
      Log
    </span>
  );
}

export function JournalTourPage({ section, mode, href, steps }: ProductTourPageProps) {
  const isJournal = section === "Journal";
  const [friendRequest, setFriendRequest] = useState<"pending" | "accepted" | null>("pending");
  const sections = ["Journal", "Sends", "Feed", "Friends", "Projects", "Analytics", "Account"];
  if (section === "Search") return <DemoClimberSearch feedHref={href("feed")} />;
  return (
    <div className="flex flex-col gap-6">
      <ProfileHeading
        name={TOUR_DEMO_CLIMBER.name}
        since={2026}
        action={mode === "full" ? <DemoLog /> : undefined}
      />
      <ProfileSectionNav
        tabs={steps
          .filter(
            (step, index) =>
              sections.includes(step.section) &&
              steps.findIndex((entry) => entry.section === step.section) === index,
          )
          .sort((a, b) => sections.indexOf(a.section) - sections.indexOf(b.section))
          .map((step) => ({
            label: step.section,
            href: href(step.id),
            current: section === step.section,
            badge:
              step.section === "Friends" ? (
                <FriendRequestBadge count={friendRequest === "pending" ? 1 : 0} />
              ) : undefined,
          }))}
      />
      {isJournal || section === "Sends" ? (
        <SidebarLayout
          sidebar={
            <StatStrip
              cards={[
                {
                  key: "all-time",
                  heading: <Eyebrow>All time</Eyebrow>,
                  stats: isJournal
                    ? [
                        { label: "Days out", value: TOUR_DEMO_ANALYTICS.daysOut },
                        {
                          label: "Sessions",
                          value: TOUR_DEMO_ENTRIES.filter((entry) => entry.kind === "session")
                            .length,
                        },
                        {
                          label: "Training",
                          value: TOUR_DEMO_ENTRIES.filter((entry) => entry.kind === "training")
                            .length,
                        },
                      ]
                    : [
                        { label: "Sends", value: TOUR_DEMO_SENDS.length },
                        { label: "Areas", value: 1 },
                        { label: "Peak grade", value: TOUR_DEMO_ANALYTICS.hardest[0].label },
                      ],
                },
              ]}
            />
          }
        >
          <section aria-label={`Alex's ${section}`} className="flex flex-col gap-3">
            <SectionHeading>{section}</SectionHeading>
            {isJournal ? <DemoJournal /> : <DemoSends />}
          </section>
        </SidebarLayout>
      ) : section === "Projects" ? (
        <section aria-label="Alex's Projects" className="flex flex-col gap-3">
          <SectionHeading>Projects</SectionHeading>
          <DemoProjects />
        </section>
      ) : section === "Analytics" ? (
        <section aria-label="Alex's Analytics" className="max-w-4xl">
          <DemoAnalytics />
        </section>
      ) : section === "Friends" ? (
        <DemoFriends incoming={friendRequest} onIncomingChange={setFriendRequest} />
      ) : section === "Feed" ? (
        <DemoFeed />
      ) : (
        <section
          aria-label="Alex's Account"
          className={`${cardClass("md")} flex max-w-xl flex-col gap-4`}
        >
          <SectionHeading>Privacy</SectionHeading>
          <DemoAccount />
        </section>
      )}
    </div>
  );
}
