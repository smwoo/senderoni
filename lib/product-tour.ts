import { ActionError } from "@/lib/action-result";

/** Add a new feature here; UI step loaders live in components/product-tours/registry.ts. */
export const PRODUCT_TOURS = [
  {
    id: "journal",
    version: 2,
    name: "Journal, friends and sharing",
    title: "Keep a climbing journal",
    description: "Learn to log sessions, add friends, and choose who can read your notes.",
    returningTitle: "Share your journal with friends",
    returningDescription:
      "Add your climbing partners as friends to see what they've been climbing. Choose who can read your journal and send notes.",
  },
] as const;

export type ProductTourId = (typeof PRODUCT_TOURS)[number]["id"];
export type ProductTourDefinition = (typeof PRODUCT_TOURS)[number];
export type ProductTourProgress = {
  tourId: string;
  version: number;
  status: "dismissed" | "completed";
};
export type ProductTourState = {
  returning: boolean;
  progress: ProductTourProgress[];
};

export function getAcknowledgedTourVersion(
  tourId: string,
  progress: readonly ProductTourProgress[] = [],
): number {
  return progress.find((entry) => entry.tourId === tourId)?.version ?? 0;
}

export function validateProductTourUpdate(
  id: string,
  version: number,
  status: string,
): ProductTourProgress {
  const tour = PRODUCT_TOURS.find((entry) => entry.id === id);
  if (!tour || version !== tour.version) {
    throw new ActionError("This tour has changed. Reload the page and try again.");
  }
  if (status !== "dismissed" && status !== "completed") {
    throw new ActionError("Invalid product tour status");
  }
  return { tourId: tour.id, version: tour.version, status };
}
