import { Skeleton, SkeletonListRows, SkeletonStatCard } from "@/components/ui/skeleton";

/** Mirrors the user page: eyebrow + display name + "Active since" line,
 * then the send list beside the sidebar's filter block and single stats
 * card (SidebarLayout renders one copy at every width). */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-9 w-56 max-w-full" />
        <Skeleton className="h-4 w-32" />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <div className="order-1 flex flex-col gap-4 lg:order-2 lg:w-80 lg:shrink-0">
          <Skeleton className="h-8 w-full lg:h-64" rounded="rounded-surface" />
          <SkeletonStatCard stats={3} />
        </div>

        <div className="order-2 flex min-w-0 flex-1 flex-col gap-4 lg:order-1">
          <SkeletonListRows rows={8} />
        </div>
      </div>
    </div>
  );
}
