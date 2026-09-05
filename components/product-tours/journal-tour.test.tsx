import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { ProductTour } from "@/components/product-tour";
import { JournalTourPage } from "@/components/product-tours/journal-tour";
import {
  PRODUCT_TOUR_STEPS,
  productTourPath,
  resolveProductTour,
} from "@/lib/product-tour-navigation";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn<(href: string) => void>() }),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/actions", () => ({
  saveProductTourStatus: vi.fn<typeof import("@/actions").saveProductTourStatus>(),
}));
vi.mock("@/components/journal/journal-entry-drawer", () => ({ JournalEntryDrawer: () => null }));

function demo(stepId: string, mode: "full" | "updates") {
  const { steps, navigation } = resolveProductTour(PRODUCT_TOUR_STEPS.journal, {
    version: 2,
    savedVersion: 1,
    navigation: { from: "journal", mode },
  });
  const step = steps.find((entry) => entry.id === stepId)!;
  return renderToStaticMarkup(
    <JournalTourPage
      section={step.section}
      mode={navigation.mode}
      steps={steps}
      href={(id) => productTourPath("journal", { ...navigation, stepId: id })}
    />,
  );
}

it.each(["completed", "dismissed"] as const)(
  "omits the Log shortcut after version 1 was %s",
  (status) => {
    const html = renderToStaticMarkup(
      <ProductTour
        initialState={{ returning: true, progress: [{ tourId: "journal", version: 1, status }] }}
      />,
    );
    expect(html).toContain("See what&#x27;s new");
    expect(html).not.toContain("Log an entry");
  },
);

it("retains the real Log shortcut for first-time invitations", () => {
  const html = renderToStaticMarkup(
    <ProductTour initialState={{ returning: false, progress: [] }} />,
  );
  expect(html).toContain("Show me how");
  expect(html).toContain("Log an entry");
});

it.each(["find-climbers", "friend-requests", "feed", "account"])(
  "omits the demo Log control from the %s update",
  (stepId) => {
    const html = demo(stepId, "updates");
    expect(html).not.toContain('data-tour-target="journal-log"');
  },
);

it("retains the original Log lesson in full replay", () => {
  const html = demo("journal", "full");
  expect(html).toContain('data-tour-target="journal-log"');
  expect(html).toContain("Alex Morgan");
  expect(html).toContain('data-tour-target="journal-filters"');
});

it.each(["full", "updates"] as const)("shows discovery on Search in the %s tour", (mode) => {
  const html = demo("find-climbers", mode);
  expect(html).toContain('aria-label="Search category"');
  expect(html).toMatch(/aria-pressed="true"[^>]*>Search climbers/);
  expect(html).toContain('data-tour-target="friend-search"');
  expect(html).toContain("Riley Chen");
  expect(html).toContain("Add friend");
  expect(html).not.toContain("Alex Morgan");
  expect(html).not.toContain('data-tour-target="friend-requests"');
  expect(html).not.toContain('href="/users/');
  expect(html).not.toContain('action="/"');
});

it("keeps request management on Friends without embedding discovery", () => {
  const html = demo("friend-requests", "updates");
  expect(html).toContain("Alex Morgan");
  expect(html).toContain("Sam Taylor");
  expect(html).toContain("Accept request");
  expect(html).toContain("All friends");
  expect(html).toContain('data-tour-target="friend-requests"');
  expect(html).not.toContain('data-tour-target="friend-search"');
  expect(html).not.toContain('aria-label="Search category"');
});
