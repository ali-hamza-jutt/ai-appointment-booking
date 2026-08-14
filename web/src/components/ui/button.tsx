import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  fullWidth?: boolean;
  isLoading?: boolean;
  leadingIcon?: ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-brand bg-brand text-surface hover:border-brand-hover hover:bg-brand-hover disabled:border-brand-disabled disabled:bg-brand-disabled",
  secondary:
    "border-border bg-surface text-ink-soft hover:border-border-strong hover:bg-surface-subtle disabled:text-subtle",
  ghost:
    "border-transparent bg-transparent text-muted hover:bg-surface-subtle disabled:text-subtle",
  danger:
    "border-danger bg-danger text-surface hover:border-danger-strong hover:bg-danger-strong disabled:opacity-60",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-xs",
  md: "min-h-10.5 px-4 text-sm",
  lg: "min-h-11.5 px-5 text-sm",
};

interface ButtonStyleOptions {
  className?: string;
  fullWidth?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

function getButtonClasses({
  className,
  fullWidth = false,
  size = "md",
  variant = "primary",
}: ButtonStyleOptions) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-[10px] border font-semibold transition-colors focus-visible:outline-2 disabled:cursor-not-allowed",
    variantClasses[variant],
    sizeClasses[size],
    fullWidth && "w-full",
    className,
  );
}

export function Button({
  children,
  className,
  disabled,
  fullWidth = false,
  isLoading = false,
  leadingIcon,
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  const unavailable = disabled || isLoading;

  return (
    <button
      aria-busy={isLoading || undefined}
      className={getButtonClasses({ className, fullWidth, size, variant })}
      disabled={unavailable}
      type={type}
      {...props}
    >
      {isLoading ? (
        <span
          aria-hidden="true"
          className="animate-bw-spin size-4 rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        leadingIcon
      )}
      {children}
    </button>
  );
}

export type LinkButtonProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    children: ReactNode;
    fullWidth?: boolean;
    leadingIcon?: ReactNode;
    size?: ButtonSize;
    variant?: ButtonVariant;
  };

export function LinkButton({
  children,
  className,
  fullWidth = false,
  leadingIcon,
  size = "md",
  variant = "primary",
  ...props
}: LinkButtonProps) {
  return (
    <Link
      className={getButtonClasses({ className, fullWidth, size, variant })}
      {...props}
    >
      {leadingIcon}
      {children}
    </Link>
  );
}
