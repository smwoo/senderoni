import { isValidElement, type ReactNode, type ElementType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SearchPage from "@/app/page";
import { AreaSearchResults, ClimbSearchResults } from "@/components/search-results";
import { getDb } from "@/db/client";
import { searchAreas, searchClimbs, getUserSentClimbIds } from "@/db/queries";
import { DEFAULT_CLIMB_SEARCH_FILTER } from "@/lib/climb-search-filter";

const sessionState = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
}));

const mockRedirect = vi.hoisted(() =>
  vi.fn<(url: string) => never>((url) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("@/lib/session", () => ({
  getSession: vi.fn<() => Promise<{ user: { id: string } } | null>>(
    async () => sessionState.session,
  ),
}));

vi.mock("@/db/client", () => ({
  getDb: vi.fn<() => Promise<unknown>>(async () => ({})),
}));

vi.mock("@/db/queries", () => ({
  getAreaBreadcrumbs: vi.fn<typeof import("@/db/queries").getAreaBreadcrumbs>(async () => ({
    4: [{ id: 1, name: "Yosemite" }],
  })),
  searchClimbs: vi.fn<typeof import("@/db/queries").searchClimbs>(async () => ({
    climbs: [
      {
        id: 7,
        areaId: 4,
        name: "Midnight Lightning",
        type: "boulder",
        grade: 9,
        areaName: "Camp 4",
      },
    ],
    hasNextPage: true,
  })),
  countSearchClimbs: vi.fn<() => Promise<number>>(async () => 0),
  searchAreas: vi.fn<typeof import("@/db/queries").searchAreas>(async () => ({
    areas: [{ id: 4, name: "Camp 4", parentId: 1, description: null, ancestorPath: "Yosemite" }],
    hasNextPage: true,
  })),
  countSearchAreas: vi.fn<() => Promise<number>>(async () => 0),
  getClimbSendStats: vi.fn<typeof import("@/db/queries").getClimbSendStats>(async () => ({
    7: { avgRating: 5, sendCount: 2, avgSuggestedGrade: 9 },
  })),
  getUserSentClimbIds: vi.fn<() => Promise<Set<number>>>(async () => new Set([7])),
}));

vi.mock("next/link", () => ({
  default: () => null,
}));

vi.mock("@/components/climber-list", () => ({ ClimberList: () => null }));
vi.mock("@/components/climber-search-form", () => ({ ClimberSearchForm: () => null }));

vi.mock("@/components/ui/app-link", () => ({
  AppLink: () => null,
}));

vi.mock("@/components/search-form", () => ({
  AreaSearchToolbar: () => null,
  ClimbSearchToolbar: () => null,
}));

vi.mock("@/components/search-results", () => ({
  AreaSearchResults: () => null,
  ClimbSearchResults: () => null,
}));

vi.mock("@/components/navigation-pending", () => ({
  NavigationPendingProvider: ({ children }: { children: React.ReactNode }) => children,
  NavigationPendingRegion: ({ children }: { children: React.ReactNode }) => children,
}));

// Inspect server-page composition; this does not claim to mount async components.
function findElements(
  node: ReactNode,
  type: ElementType,
): React.ReactElement<Record<string, unknown>>[] {
  return (Array.isArray(node) ? node : [node]).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return [];
    return [
      ...(child.type === type ? [child as React.ReactElement<Record<string, unknown>>] : []),
      ...findElements(child.props.children, type),
    ];
  });
}

function resultsProps(node: ReactNode, type: ElementType) {
  const elements = findElements(node, type);
  expect(elements).toHaveLength(1);
  return elements[0].props;
}

describe("SearchPage composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionState.session = null;
  });

  it("redirects an authenticated user on the default landing home to their own page", async () => {
    sessionState.session = { user: { id: "climber-42" } };

    await expect(SearchPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/users/climber-42",
    );
    expect(getDb).not.toHaveBeenCalled();

    expect(mockRedirect).toHaveBeenCalledWith("/users/climber-42");
  });

  it("renders the unfiltered climb search instead of a feed for an unauthenticated visitor", async () => {
    sessionState.session = null;

    const result = await SearchPage({
      searchParams: Promise.resolve({}),
    });

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(searchClimbs).toHaveBeenCalled();
    expect(resultsProps(result, ClimbSearchResults)).toMatchObject({
      initialClimbs: [{ id: 7, name: "Midnight Lightning" }],
      initialHasNextPage: true,
      initialSendStats: { 7: { avgRating: 5, sendCount: 2, avgSuggestedGrade: 9 } },
      initialAreaBreadcrumbs: { 4: [{ id: 1, name: "Yosemite" }] },
      filter: DEFAULT_CLIMB_SEARCH_FILTER,
      sort: "ascents_desc",
      sentClimbIds: undefined,
    });
    expect(getUserSentClimbIds).not.toHaveBeenCalled();
  });

  it("does not redirect an authenticated user when search parameters are present", async () => {
    sessionState.session = { user: { id: "climber-42" } };

    const result = await SearchPage({
      searchParams: Promise.resolve({ mode: "climb", name: "Midnight Lightning" }),
    });

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(resultsProps(result, ClimbSearchResults)).toMatchObject({
      initialClimbs: [{ id: 7, name: "Midnight Lightning" }],
      filter: { ...DEFAULT_CLIMB_SEARCH_FILTER, name: "Midnight Lightning" },
      sentClimbIds: new Set([7]),
    });
    expect(searchClimbs).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ name: "Midnight Lightning", sort: "ascents_desc" }),
    );
    expect(getUserSentClimbIds).toHaveBeenCalledExactlyOnceWith({}, "climber-42", [7]);
  });

  it("composes area search results with their name and initial rows", async () => {
    const result = await SearchPage({
      searchParams: Promise.resolve({ mode: "area", name: "Camp" }),
    });
    expect(resultsProps(result, AreaSearchResults)).toMatchObject({
      name: "Camp",
      initialAreas: [{ id: 4, name: "Camp 4" }],
      initialHasNextPage: true,
      initialAreaBreadcrumbs: { 4: [{ id: 1, name: "Yosemite" }] },
    });
    expect(searchAreas).toHaveBeenCalledExactlyOnceWith({}, "Camp");
    expect(searchClimbs).not.toHaveBeenCalled();
    expect(findElements(result, ClimbSearchResults)).toEqual([]);
  });
});
