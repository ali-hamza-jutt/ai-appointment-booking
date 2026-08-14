"use client";

import { useEffect, type ReactNode } from "react";

import { CloseIcon } from "@/components/ui/icons";

interface ModalProps {
  children: ReactNode;
  description?: string;
  isDismissible?: boolean;
  isOpen: boolean;
  onClose: () => void;
  title: string;
}

export function Modal({
  children,
  description,
  isDismissible = true,
  isOpen,
  onClose,
  title,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen || !isDismissible) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDismissible, isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-overlay p-0 sm:items-center sm:p-6"
      role="dialog"
    >
      {isDismissible ? (
        <button
          aria-label="Close dialog"
          className="absolute inset-0"
          onClick={onClose}
          type="button"
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0" />
      )}
      <section className="relative w-full max-w-[480px] rounded-t-[18px] border border-border bg-surface shadow-modal sm:rounded-[14px]">
        <header className="flex items-start gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
          {isDismissible ? (
            <button
              aria-label="Close dialog"
              className="flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-surface-subtle hover:text-ink"
              onClick={onClose}
              type="button"
            >
              <CloseIcon className="size-[18px]" />
            </button>
          ) : null}
        </header>
        {children}
      </section>
    </div>
  );
}
