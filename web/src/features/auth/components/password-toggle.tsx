import { EyeIcon, EyeOffIcon } from "@/components/ui/icons";

interface PasswordToggleProps {
  disabled?: boolean;
  isVisible: boolean;
  onToggle: () => void;
}

export function PasswordToggle({ disabled, isVisible, onToggle }: PasswordToggleProps) {
  const Icon = isVisible ? EyeOffIcon : EyeIcon;

  return (
    <button
      aria-label={isVisible ? "Hide password" : "Show password"}
      className="flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-surface-subtle hover:text-ink"
      disabled={disabled}
      onClick={onToggle}
      type="button"
    >
      <Icon className="size-[18px]" />
    </button>
  );
}
