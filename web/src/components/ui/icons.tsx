import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement>;

const sharedProps = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 2,
  viewBox: "0 0 24 24",
};

export function LogoIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <rect height="17" rx="2.5" width="18" x="3" y="4" />
      <path d="M3 9h18M8 3v3M16 3v3" />
      <path
        d="m12 12.5 1 2.2 2.2.5-1.6 1.6.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.6 2.2-.5Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="m22 2-11 11" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M21.8 10A10 10 0 1 1 8.5 3" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <rect height="17" rx="2" width="18" x="3" y="4" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18" />
    </svg>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </svg>
  );
}

export function ConversationsIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <rect height="16" rx="2" width="18" x="3" y="4" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M9.9 4.2A9.6 9.6 0 0 1 12 4c6.5 0 10 7 10 7a13.6 13.6 0 0 1-2.3 3M6.6 6.6A13.5 13.5 0 0 0 2 11s3.5 7 10 7a9.5 9.5 0 0 0 4-.9" />
      <path d="m3 3 18 18M10 10a2.8 2.8 0 0 0 4 4" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

export function EditIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" />
    </svg>
  );
}
