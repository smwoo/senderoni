import { beforeEach, describe, expect, it, vi } from "vitest";

import { revalidateJournalSurfaces, revalidateSendSurfaces } from "@/actions/revalidation";

const revalidatePath = vi.hoisted(() => vi.fn<(path: string) => void>());

vi.mock("next/cache", () => ({ revalidatePath }));

beforeEach(() => {
  revalidatePath.mockClear();
});

describe("revalidateSendSurfaces", () => {
  it("invalidates every profile view affected by a send", () => {
    revalidateSendSurfaces({ userIds: ["user-1"], climbIds: [12], areaIds: [34] });

    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/",
      "/feed",
      "/users/user-1",
      "/users/user-1/sends",
      "/users/user-1/projects",
      "/users/user-1/analytics",
      "/climbs/12",
      "/areas/34",
    ]);
  });

  it("deduplicates identifiers", () => {
    revalidateSendSurfaces({
      userIds: ["user-1", "user-1"],
      climbIds: [12, 12],
      areaIds: [34, 34],
    });

    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/",
      "/feed",
      "/users/user-1",
      "/users/user-1/sends",
      "/users/user-1/projects",
      "/users/user-1/analytics",
      "/climbs/12",
      "/areas/34",
    ]);
  });
});

describe("revalidateJournalSurfaces", () => {
  it("invalidates journal-derived profile views and climbs", () => {
    revalidateJournalSurfaces({ userId: "user-1", climbIds: [12, 12] });

    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/feed",
      "/users/user-1",
      "/users/user-1/journal",
      "/users/user-1/projects",
      "/users/user-1/analytics",
      "/climbs/12",
    ]);
  });
});
