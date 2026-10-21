"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button, cn } from "@ovozai/ui";
import { useAuth } from "@/lib/auth-context";

interface NavItem {
  href: string;
  label: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/agents", label: "Agents" },
  { href: "/dashboard/knowledge", label: "Knowledge" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/appointments", label: "Appointments" },
  { href: "/dashboard/calls", label: "Calls" },
  { href: "/dashboard/phone-numbers", label: "Phone numbers" },
  { href: "/dashboard/members", label: "Members" },
  { href: "/dashboard/api-keys", label: "API keys" },
  { href: "/dashboard/webhooks", label: "Webhooks" },
  { href: "/dashboard/wer", label: "WER" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/integrations", label: "Integrations" },
  { href: "/dashboard/notifications", label: "Notifications" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, user, activeOrganization, logout } = useAuth();

  useEffect(() => {
    if (status === "anonymous") {
      // Preserve the current path (e.g. an invite link) so login can return here.
      const search = typeof window !== "undefined" ? window.location.search : "";
      const next = `${pathname}${search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [status, router, pathname]);

  if (status !== "authenticated") {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <p className="text-sm text-muted-foreground" role="status">
          {status === "loading" ? "Loading your workspace…" : "Redirecting to sign in…"}
        </p>
      </main>
    );
  }

  // The overview (org switcher / create-org) and invite-accept pages must work
  // even without an active organization.
  const ORG_OPTIONAL_PATHS = ["/dashboard", "/dashboard/accept-invite"];
  const requiresActiveOrg = !ORG_OPTIONAL_PATHS.includes(pathname);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
            Ovoz<span className="text-muted-foreground">AI</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user?.email}
            </span>
            <Button variant="outline" size="sm" onClick={() => void logout()}>
              Sign out
            </Button>
          </div>
        </div>
        <nav
          aria-label="Dashboard"
          className="mx-auto flex w-full max-w-5xl gap-1 px-4 pb-2 text-sm"
        >
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition-colors hover:bg-accent",
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {!activeOrganization && requiresActiveOrg ? (
          <p className="text-sm text-muted-foreground">
            Select or create an organization on the{" "}
            <Link href="/dashboard" className="underline">
              overview
            </Link>{" "}
            page first.
          </p>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
