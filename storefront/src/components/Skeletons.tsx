import { Skeleton } from "@/components/shadcn/skeleton";

/** Placeholder shaped like the restaurant card grid; announced once to screen readers. */
export function RestaurantGridSkeleton({ label = "Finding restaurants" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <span className="sr-only">{label}...</span>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} aria-hidden="true" className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
          <Skeleton className="h-28 rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Placeholder shaped like a restaurant header and its menu rows. */
export function MenuSkeleton({ label = "Loading menu" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      <span className="sr-only">{label}...</span>
      <div aria-hidden="true" className="space-y-2">
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-4 w-1/4" />
      </div>
      <ul aria-hidden="true" className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="flex items-start justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
            <div className="w-full space-y-2">
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-3/4" />
            </div>
            <Skeleton className="h-9 w-16 rounded-lg" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Generic stacked rows for lists such as orders. */
export function RowsSkeleton({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      <span className="sr-only">{label}...</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true" className="space-y-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
