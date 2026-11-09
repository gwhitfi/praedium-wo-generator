// Small line icons (24px grid, drawn with currentColor). Decorative: pair each with visible text or an aria-label.

type IconProps = { size?: number; className?: string; strokeWidth?: number };

function Svg({ size = 16, className, strokeWidth = 2, children }: IconProps & { children: React.ReactNode }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            focusable="false"
            className={className}
        >
            {children}
        </svg>
    );
}

export const PlusIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M12 5v14M5 12h14" />
    </Svg>
);

export const PencilIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Svg>
);

export const TrashIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
        <path d="M10 11v6M14 11v6" />
    </Svg>
);

export const ArrowUpIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M12 19V5M5 12l7-7 7 7" />
    </Svg>
);

export const ArrowDownIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M12 5v14M19 12l-7 7-7-7" />
    </Svg>
);

export const ArrowLeftIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
);

export const ChevronLeftIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="m15 18-6-6 6-6" />
    </Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="m9 18 6-6-6-6" />
    </Svg>
);

export const ChevronDownIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="m6 9 6 6 6-6" />
    </Svg>
);

export const SearchIcon = (p: IconProps) => (
    <Svg {...p}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
    </Svg>
);

export const XIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M18 6 6 18M6 6l12 12" />
    </Svg>
);

export const CheckIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M5 12l5 5L19 7" />
    </Svg>
);

export const PrinterIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M6 9V2h12v7" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <path d="M6 14h12v8H6z" />
    </Svg>
);

export const CopyIcon = (p: IconProps) => (
    <Svg {...p}>
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Svg>
);

export const ExternalIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M15 3h6v6M10 14 21 3" />
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Svg>
);

export const SendIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M22 2 11 13" />
        <path d="M22 2 15 22l-4-9-9-4Z" />
    </Svg>
);

export const InfoIcon = (p: IconProps) => (
    <Svg {...p}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 16v-4M12 8h.01" />
    </Svg>
);

export const AlertIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
    </Svg>
);

export const CameraIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5Z" />
        <circle cx="12" cy="13" r="3" />
    </Svg>
);

export const NoteIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </Svg>
);

export const ArchiveIcon = (p: IconProps) => (
    <Svg {...p}>
        <rect x="2" y="3" width="20" height="5" rx="1" />
        <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4" />
    </Svg>
);

export const RotateIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5" />
    </Svg>
);

export const PlayIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="m7 4 13 8-13 8Z" />
    </Svg>
);

export const PauseIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M7 4h3v16H7zM14 4h3v16h-3z" />
    </Svg>
);

export const HomeIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />
    </Svg>
);

export const ClipboardIcon = (p: IconProps) => (
    <Svg {...p}>
        <rect x="6" y="4" width="12" height="17" rx="2" />
        <path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" />
    </Svg>
);

export const UsersIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </Svg>
);

export const BuildingIcon = (p: IconProps) => (
    <Svg {...p}>
        <rect x="4" y="2" width="16" height="20" rx="1" />
        <path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" />
    </Svg>
);

export const LinkIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </Svg>
);

export const BellIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </Svg>
);

export const SparklesIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M10 3l1.9 5.1L17 10l-5.1 1.9L10 17l-1.9-5.1L3 10l5.1-1.9L10 3Z" />
        <path d="M19 15v6M16 18h6" />
    </Svg>
);

export const SlidersIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
    </Svg>
);

export const ClockIcon = (p: IconProps) => (
    <Svg {...p}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
    </Svg>
);

export const ShieldIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3Z" />
        <path d="M9 12l2 2 4-4" />
    </Svg>
);

export const LogOutIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="m16 17 5-5-5-5M21 12H9" />
    </Svg>
);

export const MoreIcon = (p: IconProps) => (
    <Svg {...p}>
        <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </Svg>
);

export const LockIcon = (p: IconProps) => (
    <Svg {...p}>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Svg>
);

export const PhoneIcon = (p: IconProps) => (
    <Svg {...p}>
        <rect x="6" y="2" width="12" height="20" rx="2" />
        <path d="M11 18h2" />
    </Svg>
);

// A gear, for list settings.
export const SettingsIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
    </Svg>
);

export const MailIcon = (p: IconProps) => (
    <Svg {...p}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
    </Svg>
);
