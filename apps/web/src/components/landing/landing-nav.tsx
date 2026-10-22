"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * Sticky landing navigation with a blur backdrop that intensifies on scroll.
 * Auth-aware: links to the dashboard when signed in.
 */
export function LandingNav() {
  const { status } = useAuth();
  const authenticated = status === "authenticated";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { href: "#features", label: "Features" },
    { href: "#how", label: "How it works" },
    { href: "#pricing", label: "Pricing" },
    { href: "#faq", label: "FAQ" },
  ];

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "border-b border-white/10 bg-[#06070b]/80 backdrop-blur-xl" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[var(--lp-accent)] to-[var(--lp-accent-2)] text-sm font-bold text-black">
            O
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-white">
            Ovoz<span className="text-white/50">AI</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-white/60 transition-colors hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href={authenticated ? "/dashboard" : "/login"}
            className="rounded-full px-4 py-2 text-sm text-white/70 transition-colors hover:text-white"
          >
            {authenticated ? "Dashboard" : "Sign in"}
          </Link>
          <Link
            href={authenticated ? "/dashboard" : "/register"}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black shadow-[0_0_0_1px_rgba(255,255,255,0.1)] transition-all hover:shadow-[0_8px_30px_-6px_rgba(255,255,255,0.4)]"
          >
            {authenticated ? "Open app" : "Get started"}
          </Link>
        </div>
      </div>
    </header>
  );
}
