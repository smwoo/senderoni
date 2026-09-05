import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { ProfileTabs } from "@/components/profile-tabs";

const state = vi.hoisted(() => ({ pathname: "/users/owner/journal" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

it.each([
  ["/feed", "Feed"],
  ["/friends", "Friends"],
])("keeps %s in the owner's profile tabs and marks it current", (pathname, label) => {
  state.pathname = pathname;
  const html = renderToStaticMarkup(
    <ProfileTabs userId="owner" showJournal showProjects isOwner />,
  );
  expect(html).toContain('href="/users/owner/journal"');
  expect(html).toContain('href="/users/owner/sends"');
  expect(html).toContain('href="/feed"');
  expect(html).toContain('href="/friends"');
  expect(html).toMatch(new RegExp(`href="${pathname}"[^>]*aria-current="page"[^>]*>.*?${label}`));
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
});

it("does not put the viewer's Feed, Friends or Projects on another climber's profile", () => {
  state.pathname = "/users/other/sends";
  const html = renderToStaticMarkup(
    <ProfileTabs userId="other" showJournal={false} showProjects={false} isOwner={false} />,
  );
  expect(html).toContain('href="/users/other/sends" aria-current="page"');
  expect(html).toContain('href="/users/other/analytics"');
  expect(html).not.toContain('href="/feed"');
  expect(html).not.toContain('href="/friends"');
  expect(html).not.toContain("/projects");
});
