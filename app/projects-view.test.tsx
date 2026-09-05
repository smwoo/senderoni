import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ProjectsView } from "@/app/users/[id]/projects-view";

const mocks = vi.hoisted(() => ({
  getOpenProjects: vi.fn<() => Promise<Array<{ climbId: number }>>>(),
  OpenProjectList: vi.fn<(props: { projects: unknown[]; hasMore: boolean }) => null>(() => null),
}));

vi.mock("@/db/client", () => ({
  getDb: vi.fn<() => Promise<Record<string, never>>>(async () => ({})),
}));

vi.mock("@/db/queries", () => ({
  getOpenProjects: mocks.getOpenProjects,
  OPEN_PROJECT_PAGE_SIZE: 100,
}));

vi.mock("@/components/journal", () => ({
  OpenProjectList: mocks.OpenProjectList,
}));

const ownerId = "journal-owner";

describe("ProjectsView", () => {
  it.each([0, 3, 100, 101])(
    "renders the correct prefix and overflow flag for %i projects",
    async (count) => {
      const projects = Array.from({ length: count }, (_, index) => ({ climbId: index + 1 }));
      mocks.getOpenProjects.mockResolvedValue(projects);

      const result = (await ProjectsView({ ownerId })) as ReactElement<{ children: ReactNode }>;
      const children = result.props.children as ReactNode[];
      const list = children.find(
        (child) => isValidElement(child) && child.type === mocks.OpenProjectList,
      );

      expect(
        isValidElement<{ projects: unknown[]; hasMore: boolean }>(list) && list.props.projects,
      ).toEqual(projects.slice(0, 100));
      expect(
        isValidElement<{ projects: unknown[]; hasMore: boolean }>(list) && list.props.hasMore,
      ).toBe(count > 100);
    },
  );
});
