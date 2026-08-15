"use client";

import { BookWiseLogo } from "@/components/brand/bookwise-logo";
import { Button } from "@/components/ui/button";
import { AlertIcon, RefreshIcon } from "@/components/ui/icons";

export default function ApplicationError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="max-w-sm text-center">
        <div className="mb-7 flex justify-center">
          <BookWiseLogo />
        </div>
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
          <AlertIcon className="size-6" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-ink">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          This page could not be loaded. Please try again.
        </p>
        <Button
          className="mt-5"
          leadingIcon={<RefreshIcon className="size-4" />}
          onClick={retry}
        >
          Try again
        </Button>
      </div>
    </main>
  );
}
