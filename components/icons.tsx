/**
 * 共通アイコン。各コンポーネントでコピペ重複していた SVG をここに集約する。
 * すべて currentColor 基準・className="icon"・aria-hidden（装飾目的）で統一。
 * ボタン/リンク側で aria-label を付与する前提。
 */

type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function SearchIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function FilterIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

export function TrophyIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" />
    </svg>
  );
}

export function LogInIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  );
}

export function LogOutIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function ChevronLeft({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function ChevronRight({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function ChevronUp({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

export function ChevronDown({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function ExternalLinkIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

export function CopyIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function ShareIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

export function SortIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <line x1="4" y1="6" x2="16" y2="6" />
      <line x1="4" y1="12" x2="12" y2="12" />
      <line x1="4" y1="18" x2="8" y2="18" />
      <path d="M18 9V20M18 20l-3-3M18 20l3-3" />
    </svg>
  );
}

export function CloseIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function CheckIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function RefreshIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}

export function SunIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export function MoonIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function HomeIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

export function HistoryIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}

export function ShieldIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
    </svg>
  );
}

export function DatabaseIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </svg>
  );
}

export function UsersIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M16 19v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 19v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function SwordIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
      <path d="m13 19 6-6" />
      <path d="m16 16 4 4" />
      <path d="m19 21 2-2" />
    </svg>
  );
}

export function PackageIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M21 16V8l-9-5-9 5v8l9 5 9-5z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22" x2="12" y2="12" />
    </svg>
  );
}

export function FlagIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

export function SlidersIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

export function BookIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

export function TrashIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

export function ZapIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export function LinkIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function GridIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
}

export function ActivityIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

export function AlertTriangleIcon({ className = "icon" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}