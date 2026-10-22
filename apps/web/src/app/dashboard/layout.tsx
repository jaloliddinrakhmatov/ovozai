"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@ovozai/ui";
import { useAuth } from "@/lib/auth-context";
import { DashboardSidebar } from "@/components/dashboard/sidebar";

const ORG_OPTIONAL_PATHS = ["/dashboard", "/dashboard/accept-invite"];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, user, activeOrganization, activeRole, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (status === "anonymous") {
      const search = typeof window !== "undefined" ? window.location.search : "";
      router.replace(`/login?next=${encodeURIComponent(`${pathname}${search}`)}`);
    }
  }, [status, router, pathname]);

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  if (status !== "authenticated") {
    return (
      <main className="lp-dark flex min-h-dvh items-center justify-center bg-[#06070b] px-4 text-white">
        <p className="text-sm text-white/60" role="status">
          {status === "loading" ? "Loading your workspace…" : "Redirecting to sign in…"}
        </p>
      </main>
    );
  }

  const requiresActiveOrg = !ORG_OPTIONAL_PATHS.includes(pathname);

  return (
    <div className="lp-dark flex min-h-dvh bg-[#06070b] text-white">
      {/* desktop sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-0 h-dvh border-r border-white/10 bg-[#0a0b12]">
          <DashboardSidebar />
        </div>
      </aside>

      {/* mobile drawer */}
      <div className={`fixed inset-0 z-50 lg:hidden ${drawerOpen ? "" : "pointer-events-none"}`}>
        <div
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
            drawerOpen ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden
        />
        <aside
          className={`absolute left-0 top-0 h-full w-64 border-r border-white/10 bg-[#0a0b12] transition-transform duration-300 ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <DashboardSidebar onNavigate={() => setDrawerOpen(false)} />
        </aside>
      </div>

      {/* main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/10 bg-[#06070b]/80 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white/70 transition-colors hover:bg-white/5 lg:hidden"
              aria-label="Open navigation"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            {activeOrganization ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{activeOrganization.name}</span>
                {activeRole ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/50">
                    {activeRole}
                  </span>
                ) : null}
              </div>
            ) : (
              <span className="text-sm text-white/50">No organization</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden max-w-[180px] truncate text-sm text-white/45 sm:inline">
              {user?.email}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => void logout()}
            >
              Sign out
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-5xl">
            <div key={pathname} className="lp-fade-up">
              {!activeOrganization && requiresActiveOrg ? (
                <p className="text-sm text-white/55">
                  Select or create an organization on the{" "}
                  <Link href="/dashboard" className="text-white underline underline-offset-4">
                    overview
                  </Link>{" "}
                  page first.
                </p>
              ) : (
                children
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
