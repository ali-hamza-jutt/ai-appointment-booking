"use client";

import { Button } from "@/components/ui/button";
import { AlertIcon, RefreshIcon } from "@/components/ui/icons";

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-10">
      <div className="max-w-sm text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
          <AlertIcon className="size-6" />
        </span>
        <h2 className="mt-4 text-lg font-bold text-ink">This page could not be loaded</h2>
        <p className="mt-2 text-sm leading-6 text-muted">Try the request again. Your previous changes have not been submitted.</p>
        <Button className="mt-5" leadingIcon={<RefreshIcon className="size-4" />} onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
