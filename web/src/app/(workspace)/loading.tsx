import { Skeleton } from "@/components/ui/feedback";

export default function WorkspaceLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8" role="status">
      <span className="sr-only">Loading page</span>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <div className="rounded-xl border border-border bg-surface p-5" key={item}>
            <Skeleton className="size-10 rounded-[10px]" />
            <Skeleton className="mt-5 h-5 w-3/5" />
            <Skeleton className="mt-3 h-4 w-4/5" />
            <Skeleton className="mt-5 h-3 w-2/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
