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
  hideLabel?: boolean;
  hint?: string;
  id: string;
  label: string;
}

function FieldFrame({
  children,
  error,
  hideLabel = false,
  hint,
  id,
  label,
}: FieldFrameProps) {
  const descriptionId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label
        className={cn("mb-1.5 block text-xs font-semibold text-ink", hideLabel && "sr-only")}
        htmlFor={id}
      >
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
  hideLabel?: boolean;
  hint?: string;
  label: string;
  trailingAction?: ReactNode;
}

export function TextField({
  className,
  error,
  hideLabel,
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
    <FieldFrame error={error} hideLabel={hideLabel} hint={hint} id={id} label={label}>
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
  hideLabel?: boolean;
  hint?: string;
  label: string;
}

export function SelectField({
  children,
  className,
  error,
  hideLabel,
  hint,
  id,
  label,
  ...props
}: SelectFieldProps) {
  if (!id) {
    throw new Error("SelectField requires an id");
  }

  return (
    <FieldFrame error={error} hideLabel={hideLabel} hint={hint} id={id} label={label}>
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

export interface CheckboxFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  hint?: string;
  label: string;
}

export function CheckboxField({
  className,
  hint,
  id,
  label,
  ...props
}: CheckboxFieldProps) {
  if (!id) {
    throw new Error("CheckboxField requires an id");
  }

  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <input
        aria-describedby={hintId}
        className="mt-0.5 size-4 shrink-0 rounded border-border-strong accent-brand disabled:cursor-not-allowed"
        id={id}
        type="checkbox"
        {...props}
      />
      <div>
        <label className="block text-sm font-semibold text-ink" htmlFor={id}>
          {label}
        </label>
        {hint ? (
          <p className="mt-0.5 text-xs leading-5 text-muted" id={hintId}>
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export interface CheckboxListOption {
  description?: string;
  label: string;
  value: string;
}

export interface CheckboxListProps {
  emptyMessage?: string;
  hint?: string;
  id: string;
  label: string;
  onChange: (values: string[]) => void;
  options: CheckboxListOption[];
  values: string[];
}

export function CheckboxList({
  emptyMessage = "Nothing to choose yet.",
  hint,
  id,
  label,
  onChange,
  options,
  values,
}: CheckboxListProps) {
  const selected = new Set(values);

  function toggle(value: string, checked: boolean) {
    const next = new Set(selected);

    if (checked) next.add(value);
    else next.delete(value);

    onChange(options.map((option) => option.value).filter((option) => next.has(option)));
  }

  return (
    <fieldset aria-describedby={hint ? `${id}-hint` : undefined}>
      <legend className="mb-1.5 block text-xs font-semibold text-ink">{label}</legend>
      {hint ? (
        <p className="-mt-0.5 mb-2 text-xs leading-5 text-muted" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {options.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-border-strong px-3 py-2.5 text-xs text-muted">
          {emptyMessage}
        </p>
      ) : (
        <div className="bw-scrollbar max-h-56 space-y-2 overflow-y-auto rounded-[10px] border border-border p-3">
          {options.map((option) => (
            <CheckboxField
              checked={selected.has(option.value)}
              id={`${id}-${option.value}`}
              key={option.value}
              label={option.label}
              onChange={(event) => toggle(option.value, event.target.checked)}
              {...(option.description ? { hint: option.description } : {})}
            />
          ))}
        </div>
      )}
    </fieldset>
  );
}
