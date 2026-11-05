import { Skeleton } from "@/components/shadcn/skeleton";

/** Placeholder shaped like the restaurant card grid; announced once to screen readers. */
export function RestaurantGridSkeleton({ label = "Finding restaurants" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <span className="sr-only">{label}...</span>
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200"
        >
          <Skeleton className="h-36 rounded-none" />
          <div className="space-y-2.5 p-4">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <Skeleton className="h-3.5 w-1/2" />
            <div className="flex items-center gap-2 pt-1">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Placeholder shaped like a restaurant header and its menu rows. */
export function MenuSkeleton({ label = "Loading menu" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-5">
      <span className="sr-only">{label}...</span>
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200 sm:p-6"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-5 w-28 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <Skeleton className="h-8 w-3/5" />
          <Skeleton className="h-4 w-2/5" />
        </div>
      </div>
      <ul aria-hidden="true" className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <li
            key={i}
            className="flex items-start justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200"
          >
            <div className="w-full space-y-2">
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="h-5 w-3/5" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-4/5" />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Skeleton className="h-20 w-24 rounded-xl" />
              <Skeleton className="h-9 w-20 rounded-xl" />
            </div>
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
      <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-stone-200">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-7 w-12" />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200"
        >
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24 rounded-xl" />
            <Skeleton className="h-8 w-24 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Structured skeleton for an individual order receipt / live tracker page. */
export function OrderDetailSkeleton({ label = "Loading order details" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      <span className="sr-only">{label}...</span>
      <div aria-hidden="true" className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-8 w-56" />
        <div className="mt-3 flex gap-2">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-32 rounded-full" />
        </div>
      </div>
      <div aria-hidden="true" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-2.5 w-full rounded-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="space-y-2.5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="mt-2 h-6 w-full" />
      </div>
    </div>
  );
}

/** Structured skeleton for checkout page initialization. */
export function CheckoutSkeleton({ label = "Preparing checkout" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      <span className="sr-only">{label}...</span>
      <div aria-hidden="true" className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div aria-hidden="true" className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-9 w-full rounded-xl" />
      </div>
      <div aria-hidden="true" className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
        <Skeleton className="h-4 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-32 rounded-full" />
        </div>
        <Skeleton className="h-9 w-full rounded-xl" />
      </div>
      <div aria-hidden="true" className="space-y-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
      <Skeleton aria-hidden="true" className="h-12 w-full rounded-xl" />
    </div>
  );
}
