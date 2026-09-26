import { CheckCircleIcon } from "@/components/ui/icons";
import { getPasswordRequirements } from "@/features/auth/utils/auth-validation";
import { cn } from "@/lib/utils/cn";

/** Live checklist of the password rules the API enforces. */
export function PasswordRequirements({ password }: { password: string }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {getPasswordRequirements(password).map((rule) => (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs",
            rule.valid ? "text-success" : "text-muted",
          )}
          key={rule.label}
        >
          <CheckCircleIcon className="size-3.5" />
          {rule.label}
        </span>
      ))}
    </div>
  );
}

export function isPasswordAcceptable(password: string): boolean {
  return getPasswordRequirements(password).every((rule) => rule.valid);
}
