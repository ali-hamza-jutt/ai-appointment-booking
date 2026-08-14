import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils/cn";

interface FieldFrameProps {
  children: ReactNode;
  error?: string;
  hint?: string;
  id: string;
  label: string;
}

function FieldFrame({
  children,
  error,
  hint,
  id,
  label,
}: FieldFrameProps) {
  const descriptionId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-ink" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-danger" id={descriptionId} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs leading-5 text-muted" id={descriptionId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const controlClasses =
  "w-full rounded-[10px] border bg-surface text-sm text-ink transition-colors placeholder:text-subtle focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-muted";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  hint?: string;
  label: string;
  trailingAction?: ReactNode;
}

export function TextField({
  className,
  error,
  hint,
  id,
  label,
  trailingAction,
  ...props
}: TextFieldProps) {
  if (!id) {
    throw new Error("TextField requires an id");
  }

  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <FieldFrame error={error} hint={hint} id={id} label={label}>
      <div className="relative">
        <input
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          className={cn(
            controlClasses,
            "h-11 px-3.5",
            Boolean(trailingAction) && "pr-11",
            error ? "border-danger-border" : "border-border",
            className,
          )}
          id={id}
          {...props}
        />
        {trailingAction ? (
          <div className="absolute inset-y-0 right-1 flex items-center">
            {trailingAction}
          </div>
        ) : null}
      </div>
    </FieldFrame>
  );
}

export interface SelectFieldProps
  extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
  hint?: string;
  label: string;
}

export function SelectField({
  children,
  className,
  error,
  hint,
  id,
  label,
  ...props
}: SelectFieldProps) {
  if (!id) {
    throw new Error("SelectField requires an id");
  }

  return (
    <FieldFrame error={error} hint={hint} id={id} label={label}>
      <select
        aria-invalid={Boolean(error)}
        className={cn(
          controlClasses,
          "h-11 px-3.5",
          error ? "border-danger-border" : "border-border",
          className,
        )}
        id={id}
        {...props}
      >
        {children}
      </select>
    </FieldFrame>
  );
}

export interface TextAreaFieldProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  hint?: string;
  label: string;
}

export function TextAreaField({
  className,
  error,
  hint,
  id,
  label,
  ...props
}: TextAreaFieldProps) {
  if (!id) {
    throw new Error("TextAreaField requires an id");
  }

  return (
    <FieldFrame error={error} hint={hint} id={id} label={label}>
      <textarea
        aria-invalid={Boolean(error)}
        className={cn(
          controlClasses,
          "min-h-20 resize-y px-3.5 py-3",
          error ? "border-danger-border" : "border-border",
          className,
        )}
        id={id}
        {...props}
      />
    </FieldFrame>
  );
}
