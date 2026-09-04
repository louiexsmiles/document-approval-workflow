export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <div className="h-8 w-48 animate-pulse rounded-md bg-stone-200/80" />
      <div className="h-4 w-72 animate-pulse rounded-md bg-stone-200/60" />
      <div className="card card-pad space-y-3">
        <div className="h-4 w-full animate-pulse rounded-md bg-stone-100" />
        <div className="h-4 w-5/6 animate-pulse rounded-md bg-stone-100" />
        <div className="h-4 w-2/3 animate-pulse rounded-md bg-stone-100" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
