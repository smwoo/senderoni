import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import { AuthNav } from "@/components/auth-nav";

const state = vi.hoisted((): { requests: { userId: string; count: number | null } } => ({
  requests: { userId: "owner", count: 2 },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/hooks/use-mounted", () => ({ useMounted: () => true }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "owner", name: "Alex" } }, isPending: false }),
  },
}));
vi.mock("@/components/friend-requests-provider", () => ({
  useFriendRequests: () => state.requests,
}));

beforeEach(() => {
  state.requests = { userId: "owner", count: 2 };
});

it.each(["row", "col"] as const)(
  "puts the request dot on Account, not My Journal, in %s navigation",
  (direction) => {
    const html = renderToStaticMarkup(<AuthNav direction={direction} />);
    const journal = html.match(/<a[^>]*href="\/users\/owner"[^>]*>(.*?)<\/a>/)![1];
    const account = html.match(/<a[^>]*href="\/account"[^>]*>(.*?)<\/a>/)![1];
    expect(journal).toBe("My Journal");
    expect(html).toContain('aria-label="Account, pending friend requests"');
    expect(account).toContain('aria-hidden="true"');
    expect(account).toContain("size-2.5");
    expect(html).not.toMatch(/>2</);
  },
);

it.each([0, null])("omits the dot when the count is %s", (count) => {
  state.requests.count = count;
  const html = renderToStaticMarkup(<AuthNav />);
  expect(html).toContain('aria-label="Account"');
  expect(html).not.toContain("pending friend requests");
  expect(html).not.toContain("size-2.5");
});

it("does not show a previous account's requests", () => {
  state.requests.userId = "previous-owner";
  const html = renderToStaticMarkup(<AuthNav />);
  expect(html).toContain('aria-label="Account"');
  expect(html).not.toContain("pending friend requests");
  expect(html).not.toContain("size-2.5");
});
