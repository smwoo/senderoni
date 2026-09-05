import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import type { FeedDay } from "@/db/queries";

import { FeedDayCard } from "./feed-day-card";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({ default: () => null }));
const day: FeedDay = {
  userId: "climber",
  name: "Alex",
  image: null,
  date: "2026-09-01",
  journalVisible: true,
  sends: 1,
  repeats: 0,
  sessions: 0,
  training: 1,
  activities: [
    {
      id: 1,
      kind: "send",
      climbId: 12,
      climbName: "Quiet Arete",
      climbType: "boulder",
      climbGrade: 5,
      areaId: 3,
      areaName: "Pine Canyon",
      ascentStyle: "flash",
      body: "Found the sequence.",
    },
  ],
};

it("links activity and day details to the correct entities and filter", () => {
  const html = renderToStaticMarkup(<FeedDayCard day={day} view="all" />);
  expect(html).toContain('href="/climbs/12/quiet-arete"');
  expect(html).toContain('href="/areas/3/pine-canyon"');
  expect(html).toContain('href="/users/climber/journal?date=2026-09-01"');
  expect(html).toContain("1 send · 1 training entry");
  expect(html).toContain("Found the sequence.");
  expect(html).toContain("Flash");
  for (const [journalVisible, view] of [
    [false, "all"],
    [true, "sends"],
  ] as const) {
    const sends = renderToStaticMarkup(
      <FeedDayCard day={{ ...day, journalVisible }} view={view} />,
    );
    expect(sends).toContain('href="/users/climber/sends?date=2026-09-01"');
    expect(sends).not.toContain("/journal?");
  }
});
