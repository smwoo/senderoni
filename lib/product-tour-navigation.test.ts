import { describe, expect, it } from "vitest";

import { PRODUCT_TOURS, getAcknowledgedTourVersion } from "@/lib/product-tour";
import {
  findProductTour,
  resolveProductTour,
  parseProductTourNavigation,
  PRODUCT_TOUR_STEPS,
  productTourExitPath,
  productTourPath,
  type ProductTourStepDefinition,
} from "@/lib/product-tour-navigation";

describe("route-based tours", () => {
  it.each(["completed", "dismissed"] as const)(
    "offers friends, feed, and revised privacy lessons after version 1 was %s",
    (status) => {
      const tour = PRODUCT_TOURS[0];
      const savedVersion = getAcknowledgedTourVersion(tour.id, [
        { tourId: tour.id, version: 1, status },
      ]);
      const result = resolveProductTour(PRODUCT_TOUR_STEPS[tour.id], {
        version: tour.version,
        savedVersion,
        navigation: { from: "journal", mode: "updates" },
      });
      expect(result.shouldInvite).toBe(true);
      expect(result.navigation.mode).toBe("updates");
      expect(result.steps.map((step) => step.id)).toEqual([
        "find-climbers",
        "friend-requests",
        "feed",
        "account",
      ]);
    },
  );

  it("includes the social lessons in full replay and stops inviting after version 2", () => {
    const tour = PRODUCT_TOURS[0];
    const result = resolveProductTour(PRODUCT_TOUR_STEPS[tour.id], {
      version: tour.version,
      savedVersion: 2,
      navigation: { from: "account", mode: "updates" },
    });
    expect(result.shouldInvite).toBe(false);
    expect(result.navigation).toEqual({ from: "account", mode: "full" });
    expect(result.steps.map((step) => step.id)).toEqual([
      "journal",
      "journal-filters",
      "sends",
      "projects",
      "analytics",
      "find-climbers",
      "friend-requests",
      "feed",
      "account",
    ]);
  });

  it("gives every registered tour unique, addressable steps with stable targets", () => {
    for (const tour of PRODUCT_TOURS) {
      const steps = PRODUCT_TOUR_STEPS[tour.id];
      expect(steps.length).toBeGreaterThan(0);
      expect(new Set(steps.map((step) => step.id)).size).toBe(steps.length);
      for (const step of steps) {
        expect(Number.isInteger(step.introducedInVersion)).toBe(true);
        expect(step.introducedInVersion).toBeGreaterThanOrEqual(1);
        expect(step.introducedInVersion).toBeLessThanOrEqual(tour.version);
        if (step.updatedInVersion !== undefined) {
          expect(Number.isInteger(step.updatedInVersion)).toBe(true);
          expect(step.updatedInVersion).toBeGreaterThan(step.introducedInVersion);
          expect(step.updatedInVersion).toBeLessThanOrEqual(tour.version);
        }
        expect(step.target).toMatch(/^[a-z][a-z0-9-]+$/);
        expect(productTourPath(tour.id, { stepId: step.id })).toBe(
          `/tutorial/${tour.id}/${step.id}`,
        );
      }
    }
  });

  it("keeps Account replay's return destination across steps", () => {
    for (const step of PRODUCT_TOUR_STEPS.journal) {
      expect(productTourPath("journal", { stepId: step.id, from: "account" })).toBe(
        `/tutorial/journal/${step.id}?from=account`,
      );
    }
    expect(productTourExitPath("owner", "account")).toBe("/account");
  });

  it("never uses an arbitrary return URL or sample ID for the user's destination", () => {
    expect(
      productTourExitPath(
        "owner",
        parseProductTourNavigation({ from: "https://example.com" }).from,
      ),
    ).toBe("/users/owner/journal");
    expect(
      productTourExitPath("owner", parseProductTourNavigation({ from: "//example.com" }).from),
    ).toBe("/users/owner/journal");
    expect(productTourExitPath("owner", parseProductTourNavigation({}).from)).toBe(
      "/users/owner/journal",
    );
    expect(productTourPath("journal", { stepId: "missing" })).toBe("/tutorial/journal/journal");
    expect(findProductTour("missing")).toBeUndefined();
  });

  it("keeps update mode on step links while Account always replays the full tour", () => {
    expect(productTourPath("journal", { stepId: "sends", mode: "updates" })).toBe(
      "/tutorial/journal/sends?mode=updates",
    );
    expect(productTourPath("journal", { stepId: "sends", from: "account", mode: "updates" })).toBe(
      "/tutorial/journal/sends?from=account",
    );
    expect(productTourPath("journal", { stepId: "sends" })).toBe("/tutorial/journal/sends");
  });
});

describe("lessons added after a user's acknowledged version", () => {
  const steps: ProductTourStepDefinition[] = [
    { ...PRODUCT_TOUR_STEPS.journal[0], id: "original", introducedInVersion: 1 },
    {
      ...PRODUCT_TOUR_STEPS.journal[1],
      id: "revised",
      introducedInVersion: 1,
      updatedInVersion: 3,
    },
    { ...PRODUCT_TOUR_STEPS.journal[2], id: "addition-v2", introducedInVersion: 2 },
    { ...PRODUCT_TOUR_STEPS.journal[3], id: "addition-v3", introducedInVersion: 3 },
  ];
  const resolve = (version: number, savedVersion = 0) =>
    resolveProductTour(steps, {
      version,
      savedVersion,
      navigation: { from: "journal", mode: "updates" },
    });
  const ids = (version: number, savedVersion = 0) =>
    resolve(version, savedVersion).steps.map((step) => step.id);

  it("includes the full tour for first-time users and explicit replay", () => {
    expect(ids(3)).toEqual(["original", "revised", "addition-v2", "addition-v3"]);
  });
  it("includes additions across missed releases and substantial revisions in catalog order", () => {
    expect(ids(3, 1)).toEqual(["revised", "addition-v2", "addition-v3"]);
    expect(ids(3, 2)).toEqual(["revised", "addition-v3"]);
  });
  it("does not offer unchanged lessons or already acknowledged versions", () => {
    for (const savedVersion of [3, 4]) {
      expect(resolve(3, savedVersion)).toMatchObject({
        shouldInvite: false,
        navigation: { mode: "full" },
        steps,
      });
    }
    expect(resolveProductTour([steps[0]], { version: 3, savedVersion: 1 })).toMatchObject({
      shouldInvite: false,
    });
  });
  it("supports an update containing just one new lesson", () => {
    expect(
      resolveProductTour([steps[0], steps[2]], {
        version: 2,
        savedVersion: 1,
        navigation: { from: "journal", mode: "updates" },
      }).steps.map((step) => step.id),
    ).toEqual(["addition-v2"]);
  });
  it("does not offer steps before their introduction", () => {
    expect(ids(1)).toEqual(["original", "revised"]);
    expect(ids(2, 1)).toEqual(["addition-v2"]);
  });
});

describe("shared tour selection policy", () => {
  const steps = [
    { ...PRODUCT_TOUR_STEPS.journal[0], introducedInVersion: 1 },
    { ...PRODUCT_TOUR_STEPS.journal[1], introducedInVersion: 2 },
  ];
  const navigation = { from: "journal", mode: "updates" } as const;

  it("invites first-time users to every published lesson", () => {
    expect(resolveProductTour(steps, { version: 2, navigation })).toEqual({
      shouldInvite: true,
      steps,
      navigation: { from: "journal", mode: "full" },
    });
  });
  it.each(["completed", "dismissed"] as const)(
    "uses %s progress for invitation and playback",
    (status) => {
      const progress = [{ tourId: "journal", version: 1, status }];
      const savedVersion = getAcknowledgedTourVersion("journal", progress);
      expect(resolveProductTour(steps, { version: 2, savedVersion, navigation })).toEqual({
        shouldInvite: true,
        steps: [steps[1]],
        navigation,
      });
      expect(resolveProductTour(steps, { version: 1, savedVersion, navigation }).shouldInvite).toBe(
        false,
      );
      expect(getAcknowledgedTourVersion("another-tour", progress)).toBe(0);
    },
  );
  it("replays every lesson from Account or an explicit full-tour link", () => {
    for (const requested of [
      { from: "account", mode: "updates" },
      { from: "journal", mode: "full" },
    ] as const) {
      expect(
        resolveProductTour(steps, { version: 2, savedVersion: 1, navigation: requested }),
      ).toEqual({
        shouldInvite: true,
        steps,
        navigation: { from: requested.from, mode: "full" },
      });
    }
  });
});

describe("shared tour query parsing", () => {
  it.each([
    ["", { from: "journal", mode: "full" }],
    ["mode=updates", { from: "journal", mode: "updates" }],
    ["from=account&mode=updates", { from: "account", mode: "full" }],
    ["from=https://example.com&mode=unknown", { from: "journal", mode: "full" }],
    ["from=account&from=journal&mode=updates", { from: "journal", mode: "updates" }],
    ["mode=updates&mode=updates", { from: "journal", mode: "full" }],
  ])("parses %s identically on server and client", (query, expected) => {
    const client = new URLSearchParams(query);
    const server: Record<string, string | string[]> = {};
    for (const key of ["from", "mode"]) {
      const values = client.getAll(key);
      if (values.length) server[key] = values.length === 1 ? values[0] : values;
    }
    expect(
      parseProductTourNavigation({ from: client.getAll("from"), mode: client.getAll("mode") }),
    ).toEqual(expected);
    expect(parseProductTourNavigation(server)).toEqual(expected);
  });
});
