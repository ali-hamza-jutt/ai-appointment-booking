import { BookWiseLogo } from "@/components/brand/bookwise-logo";
import { Spinner } from "@/components/ui/feedback";

export function AuthLoadingScreen({ message = "Checking your session…" }: { message?: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="text-center" role="status">
        <div className="mb-6 flex justify-center">
          <BookWiseLogo />
        </div>
        <Spinner className="mx-auto" />
        <p className="mt-3 text-sm text-muted">{message}</p>
      </div>
    </main>
  );
}
