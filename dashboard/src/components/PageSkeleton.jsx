/**
 * PageSkeleton — lightweight skeleton used as the Suspense fallback
 * while a lazily-loaded page chunk is being fetched.
 *
 * Mimics a generic page layout so the transition feels smooth.
 */
export default function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse p-2">
      {/* Page title bar */}
      <div className="h-8 w-64 rounded bg-base-300" />

      {/* Content rows */}
      <div className="card bg-base-100 shadow p-4 gap-3 flex flex-col">
        <div className="h-4 w-full rounded bg-base-300" />
        <div className="h-4 w-5/6 rounded bg-base-300" />
        <div className="h-4 w-4/6 rounded bg-base-300" />
      </div>

      <div className="card bg-base-100 shadow p-4 gap-3 flex flex-col">
        <div className="h-4 w-full rounded bg-base-300" />
        <div className="h-4 w-3/4 rounded bg-base-300" />
        <div className="h-32 w-full rounded bg-base-300 mt-2" />
      </div>

      <div className="card bg-base-100 shadow p-4 gap-3 flex flex-col">
        <div className="h-4 w-2/4 rounded bg-base-300" />
        <div className="h-4 w-5/6 rounded bg-base-300" />
      </div>
    </div>
  );
}
