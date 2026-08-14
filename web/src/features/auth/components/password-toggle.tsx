import { EyeIcon, EyeOffIcon } from "@/components/ui/icons";

interface PasswordToggleProps {
  disabled?: boolean;
  fieldLabel?: string;
  isVisible: boolean;
  onToggle: () => void;
}

export function PasswordToggle({
  disabled,
  fieldLabel = "password",
  isVisible,
  onToggle,
}: PasswordToggleProps) {
  const Icon = isVisible ? EyeOffIcon : EyeIcon;

  return (
    <button
      aria-label={`${isVisible ? "Hide" : "Show"} ${fieldLabel}`}
      aria-pressed={isVisible}
      className="flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-surface-subtle hover:text-ink"
      disabled={disabled}
      onClick={onToggle}
      type="button"
    >
      <Icon className="size-[18px]" />
    </button>
  );
}
