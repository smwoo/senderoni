import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";

/** Mirrors the search page: mode switch pill, then the results heading, the
 * one-row filter toolbar, and the results list. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-10 w-64" rounded="rounded-full" />
      <section className="flex flex-col gap-3">
        <Skeleton className="h-6 w-24" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-64" rounded="rounded-inset" />
          <Skeleton className="h-8 w-20" rounded="rounded-full" />
          <Skeleton className="h-8 w-20" rounded="rounded-full" />
          <Skeleton className="h-8 w-16" rounded="rounded-full" />
        </div>
        <SkeletonListRows rows={6} />
      </section>
    </div>
  );
}
