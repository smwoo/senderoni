import { expect, it, vi } from "vitest";

import FriendsPage from "@/app/friends/page";
import type { SearchParamsRecord } from "@/lib/search-params";

vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
}));
vi.mock("@/lib/session", () => ({ getSession: async () => null }));
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("next/image", () => ({ default: () => null }));

it.each([
  [{ view: "requests" }, "/sign-in?next=%2Ffriends%3Fview%3Drequests"],
  [{}, "/sign-in?next=%2Ffriends"],
  [{ view: "https://example.com" }, "/sign-in?next=%2Ffriends"],
] satisfies [SearchParamsRecord, string][])(
  "preserves the Requests email destination through sign-in for %j",
  async (params, destination) => {
    await expect(FriendsPage({ searchParams: Promise.resolve(params) })).rejects.toThrow(
      `redirect:${destination}`,
    );
  },
);
