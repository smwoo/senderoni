"use client";

import { clsx } from "clsx";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { FriendRequestBadge } from "@/components/friend-request-badge";
import { useFriendRequests } from "@/components/friend-requests-provider";
import { AppLink } from "@/components/ui/app-link";

type ProfileTabsProps = {
  userId: string;
  showJournal: boolean;
  showProjects: boolean;
  isOwner: boolean;
};

export function ProfileTabs({ userId, showJournal, showProjects, isOwner }: ProfileTabsProps) {
  const pathname = usePathname();
  const requests = useFriendRequests();
  const base = `/users/${userId}`;

  const tabs: { href: string; label: string; roots: string[]; badge?: ReactNode }[] = [
    ...(showJournal ? [{ href: `${base}/journal`, label: "Journal", roots: [base] }] : []),
    { href: `${base}/sends`, label: "Sends", roots: showJournal ? [] : [base] },
    ...(isOwner
      ? [
          { href: "/feed", label: "Feed", roots: [] },
          {
            href: "/friends",
            label: "Friends",
            roots: [],
            badge: (
              <FriendRequestBadge count={requests.userId === userId ? requests.count : null} />
            ),
          },
        ]
      : []),
    ...(showProjects ? [{ href: `${base}/projects`, label: "Projects", roots: [] }] : []),
    { href: `${base}/analytics`, label: "Analytics", roots: [] },
  ];

  return (
    <ProfileSectionNav
      tabs={tabs.map((tab) => ({
        ...tab,
        current: pathname === tab.href || tab.roots.includes(pathname),
      }))}
    />
  );
}

export function ProfileSectionNav({
  tabs,
  label = "Profile sections",
}: {
  tabs: readonly ({ label: string; current: boolean; badge?: ReactNode } & (
    | { href: string; onSelect?: never }
    | { href?: never; onSelect: () => void }
  ))[];
  label?: string;
}) {
  return (
    <nav aria-label={label} className="w-full max-w-full overflow-x-auto border-b border-separator">
      <div className="flex min-w-max items-center gap-6">
        {tabs.map((tab) => {
          const current = tab.current;
          const className = clsx(
            "relative inline-flex items-center gap-1.5 py-2.5 text-sm no-underline transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:content-[''] focus-visible:status-focused",
            current
              ? "font-medium text-foreground after:bg-foreground"
              : "text-muted after:bg-transparent hover:text-foreground",
          );
          if (tab.onSelect) {
            return (
              <button
                key={tab.label}
                type="button"
                aria-pressed={current}
                onClick={tab.onSelect}
                className={className}
              >
                {tab.label}
                {tab.badge}
              </button>
            );
          }
          return (
            <AppLink
              key={tab.href}
              href={tab.href}
              aria-current={current ? "page" : undefined}
              className={className}
            >
              {tab.label}
              {tab.badge}
            </AppLink>
          );
        })}
      </div>
    </nav>
  );
}
