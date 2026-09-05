import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex w-full flex-col gap-5" role="status" aria-label="Loading feed">
      <Skeleton className="h-9 w-32" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-8 w-48" rounded="rounded-full" />
      <SkeletonListRows rows={6} />
    </div>
  );
}
