import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Dark, cinematic shell for the auth pages (login / register). Scoped `.lp-dark`
 * flips the shared design tokens so the @ovozai/ui form components render dark.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="lp-dark relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#06070b] px-4 py-12 text-white">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="lp-aurora absolute -top-40 left-1/3 h-[32rem] w-[32rem] rounded-full bg-[radial-gradient(circle,_rgba(var(--lp-accent-rgb),0.2),_transparent_60%)] blur-3xl" />
        <div
          className="lp-aurora absolute -bottom-32 right-1/4 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,_rgba(var(--lp-accent-2-rgb),0.14),_transparent_60%)] blur-3xl"
          style={{ animationDelay: "-6s" }}
        />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent 80%)",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[var(--lp-accent)] to-[var(--lp-accent-2)] text-sm font-bold text-black">
            O
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Ovoz<span className="text-white/50">AI</span>
          </span>
        </Link>

        <div className="lp-fade-up rounded-2xl border border-white/10 bg-white/[0.03] p-7 shadow-2xl backdrop-blur-xl">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-white/50">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>

        {footer ? <p className="mt-6 text-center text-sm text-white/45">{footer}</p> : null}
      </div>
    </div>
  );
}
