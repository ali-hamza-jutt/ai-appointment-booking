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

export function BuildingIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <rect height="18" rx="1.5" width="14" x="5" y="3" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <rect height="16" rx="2" width="20" x="2" y="4" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  );
}

export function ScissorsIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" />
    </svg>
  );
}

export function StethoscopeIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M5 3v5a5 5 0 0 0 10 0V3" />
      <path d="M10 13v2a5 5 0 0 0 10 0v-2" />
      <circle cx="20" cy="11" r="2" />
    </svg>
  );
}

export function BriefcaseIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <rect height="14" rx="2" width="20" x="2" y="7" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20" />
    </svg>
  );
}

export function LeafIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M11 20A7 7 0 0 1 4 13c0-6 5-10 16-10 0 11-4 17-9 17Z" />
      <path d="M4 21c3-4 6-7 11-10" />
    </svg>
  );
}

export function DumbbellIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12" />
    </svg>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5Z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </svg>
  );
}

export function PawIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <circle cx="5.5" cy="10" r="2" />
      <circle cx="9.5" cy="5.5" r="2" />
      <circle cx="14.5" cy="5.5" r="2" />
      <circle cx="18.5" cy="10" r="2" />
      <path d="M12 12c-3 0-5.5 3.5-5.5 6a2.5 2.5 0 0 0 3.5 2.3 5 5 0 0 1 4 0A2.5 2.5 0 0 0 17.5 18c0-2.5-2.5-6-5.5-6Z" />
    </svg>
  );
}

export function ContactIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <rect height="18" rx="2" width="16" x="4" y="3" />
      <circle cx="12" cy="10" r="3" />
      <path d="M8 17a4 4 0 0 1 8 0" />
    </svg>
  );
}

export function TagIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...sharedProps} {...props}>
      <path d="M3 6a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}
