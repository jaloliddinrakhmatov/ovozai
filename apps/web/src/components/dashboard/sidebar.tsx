"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Workspace",
    items: [{ href: "/dashboard", label: "Overview", icon: <GridIcon /> }],
  },
  {
    label: "Voice",
    items: [
      { href: "/dashboard/agents", label: "Agents", icon: <BotIcon /> },
      { href: "/dashboard/knowledge", label: "Knowledge", icon: <BookIcon /> },
      { href: "/dashboard/calls", label: "Calls", icon: <PhoneIcon /> },
      { href: "/dashboard/phone-numbers", label: "Phone numbers", icon: <HashIcon /> },
      { href: "/dashboard/wer", label: "Accuracy (WER)", icon: <WaveIcon /> },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/dashboard/customers", label: "Customers", icon: <UsersIcon /> },
      { href: "/dashboard/appointments", label: "Appointments", icon: <CalendarIcon /> },
      { href: "/dashboard/billing", label: "Billing", icon: <CardIcon /> },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/dashboard/members", label: "Members", icon: <UsersIcon /> },
      { href: "/dashboard/api-keys", label: "API keys", icon: <KeyIcon /> },
      { href: "/dashboard/webhooks", label: "Webhooks", icon: <WebhookIcon /> },
      { href: "/dashboard/integrations", label: "Integrations", icon: <PuzzleIcon /> },
      { href: "/dashboard/notifications", label: "Notifications", icon: <BellIcon /> },
      { href: "/dashboard/compliance", label: "Compliance", icon: <ShieldIcon /> },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

export function DashboardSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="flex items-center gap-2.5 px-5 py-5"
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[var(--lp-accent)] to-[var(--lp-accent-2)] text-sm font-bold text-black">
          O
        </span>
        <span className="font-display text-[15px] font-semibold tracking-tight text-white">
          Ovoz<span className="text-white/40">AI</span>
        </span>
      </Link>

      <nav aria-label="Dashboard" className="flex-1 overflow-y-auto px-3 pb-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
              {group.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
                        active
                          ? "bg-white/[0.07] text-white"
                          : "text-white/55 hover:bg-white/[0.04] hover:text-white"
                      }`}
                    >
                      <span
                        className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-gradient-to-b from-[var(--lp-accent)] to-[var(--lp-accent-2)] transition-all duration-300 ${
                          active ? "opacity-100" : "opacity-0 group-hover:opacity-40"
                        }`}
                        aria-hidden
                      />
                      <span
                        className={`shrink-0 transition-colors ${active ? "text-[var(--lp-accent-2)]" : "text-white/40 group-hover:text-white/70"}`}
                      >
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

/* --------------------------------- icons --------------------------------- */

function base(children: ReactNode) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      {children}
    </svg>
  );
}
const S = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function GridIcon() {
  return base(
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" {...S} />
      <rect x="14" y="3" width="7" height="7" rx="1.5" {...S} />
      <rect x="3" y="14" width="7" height="7" rx="1.5" {...S} />
      <rect x="14" y="14" width="7" height="7" rx="1.5" {...S} />
    </>,
  );
}
function BotIcon() {
  return base(
    <>
      <rect x="4" y="8" width="16" height="11" rx="3" {...S} />
      <path d="M12 8V4M8 13h.01M16 13h.01" {...S} />
      <path d="M2 13h2M20 13h2" {...S} />
    </>,
  );
}
function BookIcon() {
  return base(
    <>
      <path d="M5 4a2 2 0 0 1 2-2h12v18H7a2 2 0 0 1-2-2V4z" {...S} />
      <path d="M9 2v18" {...S} />
    </>,
  );
}
function PhoneIcon() {
  return base(
    <path
      d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"
      {...S}
    />,
  );
}
function HashIcon() {
  return base(<path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" {...S} />);
}
function WaveIcon() {
  return base(<path d="M3 12h2l2-6 4 14 3-10 2 4h5" {...S} />);
}
function UsersIcon() {
  return base(
    <>
      <circle cx="9" cy="8" r="3.2" {...S} />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M18.5 20a5 5 0 0 0-3-4.6" {...S} />
    </>,
  );
}
function CalendarIcon() {
  return base(
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" {...S} />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" {...S} />
    </>,
  );
}
function CardIcon() {
  return base(
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" {...S} />
      <path d="M2.5 9.5h19M6 15h4" {...S} />
    </>,
  );
}
function KeyIcon() {
  return base(
    <>
      <circle cx="8" cy="8" r="4" {...S} />
      <path d="M10.8 10.8 20 20M17 17l2-2M15 15l1.5-1.5" {...S} />
    </>,
  );
}
function WebhookIcon() {
  return base(
    <>
      <path d="M12 7a3 3 0 0 0-2.6 4.5L6 17M12 7a3 3 0 0 1 2.6 4.5" {...S} />
      <circle cx="6" cy="18" r="2" {...S} />
      <circle cx="18" cy="18" r="2" {...S} />
      <path d="M8 18h8M14.6 11.5 18 16" {...S} />
    </>,
  );
}
function PuzzleIcon() {
  return base(
    <path
      d="M10 3.5a1.5 1.5 0 0 1 3 0c0 .8.7 1.5 1.5 1.5H17a1 1 0 0 1 1 1v2.5c0 .8.7 1.5 1.5 1.5a1.5 1.5 0 0 1 0 3c-.8 0-1.5.7-1.5 1.5V18a1 1 0 0 1-1 1h-2.5c-.8 0-1.5.7-1.5 1.5a1.5 1.5 0 0 1-3 0c0-.8-.7-1.5-1.5-1.5H6a1 1 0 0 1-1-1v-2.5C5 14.7 4.3 14 3.5 14a1.5 1.5 0 0 1 0-3c.8 0 1.5-.7 1.5-1.5V7a1 1 0 0 1 1-1h2.5C9.3 6 10 5.3 10 4.5z"
      {...S}
    />,
  );
}
function BellIcon() {
  return base(
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" {...S} />
      <path d="M10.5 21a2 2 0 0 0 3 0" {...S} />
    </>,
  );
}
function ShieldIcon() {
  return base(
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" {...S} />
      <path d="M9 12l2 2 4-4" {...S} />
    </>,
  );
}
