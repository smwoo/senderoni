import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";

/** Mirrors the area page's crag header (breadcrumbs, eyebrow, display
 * title, description, info strip, then the grade histogram — collapsed
 * to a trigger row below md, charts above it), the sub-area block, then the
 * climb table beside the lg:w-80 filter sidebar. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-4 w-56 max-w-full" />

      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 w-16" rounded="rounded-full" />
        </div>
        {/* The histogram is a collapsed accordion below md and the charts
         * themselves from md up (see AreaCragHeader), so the skeleton
         * splits the same way — a trigger row on a phone, sized like the
         * sub-area heading below, rather than charts that never arrive. */}
        <Skeleton className="mt-2 h-6 w-28 md:hidden" />
        <div className="mt-2 hidden items-end gap-6 md:flex">
          <Skeleton className="h-20 w-64 max-w-[45%]" />
          <Skeleton className="h-20 w-64 max-w-[45%]" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-28" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-24" rounded="rounded-inset" />
          <Skeleton className="h-8 w-32" rounded="rounded-inset" />
          <Skeleton className="h-8 w-20" rounded="rounded-inset" />
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <div className="order-2 flex min-w-0 flex-1 flex-col gap-2 lg:order-1">
          <SkeletonListRows rows={8} />
        </div>
        <div className="order-1 lg:order-2 lg:w-80 lg:shrink-0">
          <Skeleton className="h-8 w-full lg:h-96" rounded="rounded-surface" />
        </div>
      </div>
    </div>
  );
}
