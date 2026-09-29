"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form-controls";
import { Modal } from "@/components/ui/modal";
import { SectionCard } from "@/components/ui/section-card";
import { useAuth } from "@/features/auth/auth-context";
import { downloadJson } from "@/features/privacy/download-json";
import { exportMyData, useDeleteMyAccount } from "@/generated/api/privacy/privacy";
import { getApiErrorMessage } from "@/lib/api/api-error";

/** The person's own data: a copy of everything BookWise holds, or deleting the account. */
export function MyData({ email }: { email: string }) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const deleteMutation = useDeleteMyAccount({
    mutation: {
      onSuccess: () => {
        void signOut().finally(() => router.replace("/login"));
      },
    },
  });

  async function exportData() {
    setIsExporting(true);
    setExportError(null);

    try {
      downloadJson("my-bookwise-data.json", await exportMyData());
    } catch (error) {
      setExportError(error);
    } finally {
      setIsExporting(false);
    }
  }

  function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    deleteMutation.mutate({ data: { confirmEmail } });
  }

  return (
    <SectionCard
      className="mt-5"
      description="Download everything BookWise and the businesses you booked with hold about you, or delete your account."
      title="Your data"
    >
      {exportError ? (
        <Alert className="mb-3" tone="danger">
          {getApiErrorMessage(exportError, "Your data couldn't be downloaded. Please try again.")}
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button isLoading={isExporting} onClick={() => void exportData()} size="sm" variant="secondary">
          Download my data
        </Button>
        <Button onClick={() => setIsDeleting(true)} size="sm" variant="ghost">
          Delete my account
        </Button>
      </div>

      <Modal
        description="Your details are erased at every business. Past bookings stay with each business without your name or contact details. This can't be undone."
        isOpen={isDeleting}
        onClose={() => setIsDeleting(false)}
        title="Delete your account?"
      >
        <form className="space-y-4 p-5 sm:p-6" onSubmit={deleteAccount}>
          <TextField
            autoComplete="off"
            hint={`Type ${email} to confirm.`}
            id="delete-account-email"
            label="Your email"
            onChange={(event) => setConfirmEmail(event.target.value)}
            value={confirmEmail}
          />
          {deleteMutation.error ? (
            <Alert tone="danger">{getApiErrorMessage(deleteMutation.error, "Your account couldn't be deleted.")}</Alert>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setIsDeleting(false)} variant="secondary">
              Keep my account
            </Button>
            <Button
              disabled={confirmEmail.trim().toLowerCase() !== email.toLowerCase()}
              isLoading={deleteMutation.isPending}
              type="submit"
              variant="danger"
            >
              Delete my account
            </Button>
          </div>
        </form>
      </Modal>
    </SectionCard>
  );
}
