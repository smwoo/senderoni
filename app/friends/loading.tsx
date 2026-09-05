import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading friends" className="flex w-full flex-col gap-5">
      <Skeleton className="h-9 w-48" />
      <SkeletonListRows rows={6} />
    </div>
  );
}
