import { cardClass } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the account page's identity card, settings grid, and danger zone. */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className={cardClass("md")}>
        <div className="flex items-center gap-4">
          <Skeleton tone="raised" className="size-16 shrink-0" rounded="rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton tone="raised" className="h-3 w-20" />
            <Skeleton tone="raised" className="h-8 w-48 max-w-full" />
            <Skeleton tone="raised" className="h-4 w-56 max-w-full" />
          </div>
          <Skeleton tone="raised" className="hidden h-9 w-32 sm:block" rounded="rounded-full" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={`flex flex-col gap-3 ${cardClass("md")}`}>
            <Skeleton tone="raised" className="h-5 w-28" />
            <Skeleton tone="raised" className="h-4 w-full" />
            <Skeleton tone="raised" className="h-9 w-32" rounded="rounded-full" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-surface border border-separator p-6">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-9 w-32" rounded="rounded-full" />
      </div>
    </div>
  );
}
