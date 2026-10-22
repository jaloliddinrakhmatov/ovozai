import Link from "next/link";
import type { ReactNode } from "react";
import { LandingNav } from "@/components/landing/landing-nav";
import { Reveal } from "@/components/landing/reveal";
import { Faq } from "@/components/landing/faq";
import { ShaderCanvas } from "@/components/landing/shader-canvas";

/* --------------------------------- data ---------------------------------- */

interface Feature {
  title: string;
  description: string;
  icon: ReactNode;
}

const FEATURES: readonly Feature[] = [
  {
    title: "Multilingual by nature",
    description:
      "Natural conversations in Uzbek, Russian, and English — it detects the caller's language and switches mid-call.",
    icon: <GlobeIcon />,
  },
  {
    title: "Books appointments",
    description:
      "Checks availability, honors your hours, prevents double-booking, and reschedules — all while the caller is on the line.",
    icon: <CalendarIcon />,
  },
  {
    title: "Answers from your knowledge",
    description:
      "Hours, pricing, address, services — answered from your own content, grounded and never invented.",
    icon: <BookIcon />,
  },
  {
    title: "Knows when to hand off",
    description:
      "Recognizes when a call needs a person and transfers it to your team with the full context intact.",
    icon: <HandoffIcon />,
  },
  {
    title: "Every call, reviewable",
    description:
      "Full transcripts, the appointments each call booked, and activity at a glance — so you can trust what it did.",
    icon: <ChartIcon />,
  },
  {
    title: "Private by design",
    description:
      "Multi-tenant isolation, recording consent, data retention and right-to-erasure — built for real compliance.",
    icon: <ShieldIcon />,
  },
];

const STEPS = [
  {
    n: "01",
    title: "Describe your business",
    body: "Add your hours, services and FAQ. The agent learns to answer like your best receptionist — in minutes, no scripting.",
  },
  {
    n: "02",
    title: "Give it a voice",
    body: "Pick a language and a natural Uzbek voice. Test a real conversation in your browser before a single call lands.",
  },
  {
    n: "03",
    title: "Go live",
    body: "Point your number at OvozAI. It answers 24/7, books appointments, and hands off to your team when it matters.",
  },
] as const;

const STATS = [
  { value: "3", label: "Languages, one agent" },
  { value: "24/7", label: "Always answering" },
  { value: "0", label: "Missed calls" },
  { value: "<1s", label: "To pick up" },
] as const;

const FAQS = [
  {
    q: "Which languages does it speak?",
    a: "Uzbek, Russian, and English. It detects the caller's language from how they speak and follows them even if they switch languages in the middle of a call.",
  },
  {
    q: "Can it actually book appointments?",
    a: "Yes. It checks real availability against your business hours, never double-books, offers the nearest open times, and can reschedule or cancel — writing straight to your dashboard.",
  },
  {
    q: "Where do its answers come from?",
    a: "From a knowledge base you control — your hours, prices, address, services and FAQ. If it doesn't have the answer, it says so and offers to take a message or transfer, rather than guessing.",
  },
  {
    q: "What happens when a call needs a person?",
    a: "The agent recognizes it, tells the caller, and transfers to your team with the conversation context — so nobody has to repeat themselves.",
  },
  {
    q: "Is my customers' data safe?",
    a: "Each business is fully isolated, calls are recorded only with consent, and you control retention and erasure. Compliance was built in, not bolted on.",
  },
] as const;

const INDUSTRIES = [
  "Clinics",
  "Dental",
  "Salons & spas",
  "Repair & service",
  "Education",
  "Hospitality",
] as const;

const PLANS = [
  {
    name: "Free",
    price: "0",
    period: "forever",
    cta: "Get started",
    highlight: false,
    features: [
      "1 AI agent",
      "100 call-minutes / month",
      "Uzbek · Russian · English",
      "Knowledge base & booking",
      "Browser test agent",
    ],
  },
  {
    name: "Starter",
    price: "490,000",
    period: "so'm / month",
    cta: "Start free",
    highlight: true,
    features: [
      "5 AI agents",
      "1,000 call-minutes / month",
      "Everything in Free",
      "Webhooks & integrations",
      "Call recordings & analytics",
    ],
  },
  {
    name: "Growth",
    price: "1,490,000",
    period: "so'm / month",
    cta: "Start free",
    highlight: false,
    features: [
      "20 AI agents",
      "5,000 call-minutes / month",
      "Everything in Starter",
      "Priority support",
      "Compliance controls",
    ],
  },
] as const;

/* --------------------------------- page ---------------------------------- */

export default function HomePage() {
  const year = new Date().getFullYear();

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#06070b] text-white antialiased">
      <BackgroundFX />
      <LandingNav />

      <main className="relative z-10">
        {/* ------------------------------ HERO ------------------------------ */}
        <section className="mx-auto w-full max-w-6xl px-5 pb-20 pt-36 sm:pt-44">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="flex flex-col items-start">
              <span className="lp-fade-up inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/70 backdrop-blur">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                AI Voice Receptionist · Uzbek · Russian · English
              </span>

              <h1
                className="font-display lp-fade-up mt-6 text-balance text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl"
                style={{ animationDelay: "80ms" }}
              >
                Never miss
                <br />
                another call.
              </h1>

              <p
                className="lp-fade-up mt-6 max-w-xl text-pretty text-lg leading-relaxed text-white/60"
                style={{ animationDelay: "160ms" }}
              >
                OvozAI answers your phone in Uzbek, Russian, and English — booking
                appointments, answering from your knowledge base, and handing off to a
                human the moment a call needs one.
              </p>

              <div
                className="lp-fade-up mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
                style={{ animationDelay: "240ms" }}
              >
                <Link
                  href="/register"
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-black shadow-[0_8px_40px_-8px_rgba(255,255,255,0.45)] transition-transform hover:-translate-y-0.5"
                >
                  Get started free
                  <span className="transition-transform group-hover:translate-x-0.5">→</span>
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/10"
                >
                  <PlayIcon />
                  See it in action
                </Link>
              </div>

              <div
                className="lp-fade-up mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-white/40"
                style={{ animationDelay: "320ms" }}
              >
                <Check>No credit card</Check>
                <Check>Live in minutes</Check>
                <Check>Test in your browser</Check>
              </div>
            </div>

            {/* Hero visual: a live call card */}
            <div className="lp-fade-up" style={{ animationDelay: "280ms" }}>
              <CallCard />
            </div>
          </div>
        </section>

        {/* --------------------------- LANG MARQUEE -------------------------- */}
        <section className="relative border-y border-white/5 py-6">
          <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-r from-[#06070b] via-transparent to-[#06070b]" />
          <div className="flex overflow-hidden">
            <div className="lp-marquee flex shrink-0 items-center gap-10 pr-10 text-sm font-medium text-white/30">
              {MARQUEE.concat(MARQUEE).map((item, i) => (
                <span key={i} className="flex items-center gap-10 whitespace-nowrap">
                  {item}
                  <span className="text-white/10">◆</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------ STATS ----------------------------- */}
        <section className="mx-auto w-full max-w-6xl px-5 py-20">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/5 lg:grid-cols-4">
            {STATS.map((s, i) => (
              <Reveal key={s.label} delay={i * 90} className="bg-[#06070b]">
                <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                  <span className="font-display bg-gradient-to-b from-white to-white/50 bg-clip-text text-4xl font-semibold text-transparent sm:text-5xl">
                    {s.value}
                  </span>
                  <span className="text-sm text-white/45">{s.label}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------------------------- INDUSTRIES -------------------------- */}
        <section className="mx-auto w-full max-w-6xl px-5 pb-6">
          <Reveal>
            <p className="text-center text-xs uppercase tracking-[0.2em] text-white/35">
              Built for local businesses
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {INDUSTRIES.map((x) => (
                <span
                  key={x}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 transition-colors hover:border-white/20 hover:text-white/80"
                >
                  {x}
                </span>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ----------------------------- FEATURES --------------------------- */}
        <section id="features" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-20">
          <Reveal>
            <SectionLabel>Capabilities</SectionLabel>
            <h2 className="font-display mt-4 max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              Everything a great receptionist does — on every call.
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 90} as="div">
                <article className="group relative h-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.04]">
                  <div
                    className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br from-[rgba(var(--lp-accent-rgb),0.2)] to-[rgba(var(--lp-accent-2-rgb),0.2)] opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                    aria-hidden
                  />
                  <div className="relative">
                    <div className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/80">
                      {f.icon}
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-white">{f.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/50">{f.description}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        {/* --------------------------- HOW IT WORKS ------------------------- */}
        <section id="how" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-20">
          <Reveal>
            <SectionLabel>How it works</SectionLabel>
            <h2 className="font-display mt-4 max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              From your phone number to answered calls, in three steps.
            </h2>
          </Reveal>

          <div className="relative mt-14 grid gap-5 lg:grid-cols-3">
            <div
              className="pointer-events-none absolute left-0 right-0 top-9 hidden h-px bg-gradient-to-r from-transparent via-white/15 to-transparent lg:block"
              aria-hidden
            />
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 120} as="div">
                <div className="relative h-full rounded-2xl border border-white/10 bg-white/[0.02] p-7">
                  <span className="font-display grid h-14 w-14 place-items-center rounded-full border border-white/10 bg-[#06070b] text-lg font-semibold text-white">
                    {s.n}
                  </span>
                  <h3 className="mt-6 text-xl font-semibold text-white">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/50">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------------------------- SHOWCASE ---------------------------- */}
        <section className="mx-auto w-full max-w-6xl px-5 py-20">
          <div className="grid items-center gap-12 rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-8 sm:p-12 lg:grid-cols-2">
            <Reveal>
              <SectionLabel>A real conversation</SectionLabel>
              <h2 className="font-display mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                It sounds like your business — not a robot.
              </h2>
              <p className="mt-5 text-pretty leading-relaxed text-white/55">
                Short, warm replies. It confirms the details, offers alternatives when a
                time is taken, and books the appointment while the caller is still on the
                line. Try it yourself in the dashboard before you ever go live.
              </p>
              <ul className="mt-7 flex flex-col gap-3">
                {[
                  "Understands Uzbek, Russian & English",
                  "Confirms the date and time back to the caller",
                  "Offers the nearest open slot on a clash",
                  "Writes the booking straight to your dashboard",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm text-white/70">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
                      <CheckMark />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Try the test agent →
              </Link>
            </Reveal>

            <Reveal delay={120}>
              <TranscriptCard />
            </Reveal>
          </div>
        </section>

        {/* ----------------------------- PRICING ---------------------------- */}
        <section id="pricing" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-20">
          <Reveal>
            <div className="text-center">
              <SectionLabel center>Pricing</SectionLabel>
              <h2 className="font-display mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
                Simple plans that grow with you.
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-pretty text-white/55">
                Start free and upgrade when you need more agents and minutes. No card to begin.
              </p>
            </div>
          </Reveal>

          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {PLANS.map((p, i) => (
              <Reveal key={p.name} delay={i * 100} as="div">
                <div
                  className={`relative flex h-full flex-col rounded-2xl border p-7 transition-all duration-300 ${
                    p.highlight
                      ? "border-white/25 bg-white/[0.05] shadow-[0_0_60px_-20px_rgba(var(--lp-accent-rgb),0.6)]"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20"
                  }`}
                >
                  {p.highlight ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-[var(--lp-accent)] to-[var(--lp-accent-2)] px-3 py-1 text-xs font-semibold text-black">
                      Most popular
                    </span>
                  ) : null}
                  <h3 className="text-lg font-semibold text-white">{p.name}</h3>
                  <div className="mt-4 flex items-end gap-2">
                    <span className="font-display text-4xl font-semibold text-white">
                      {p.price === "0" ? "Free" : p.price}
                    </span>
                    {p.price !== "0" ? (
                      <span className="pb-1.5 text-sm text-white/45">{p.period}</span>
                    ) : (
                      <span className="pb-1.5 text-sm text-white/45">{p.period}</span>
                    )}
                  </div>
                  <ul className="mt-6 flex flex-1 flex-col gap-3">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-white/65">
                        <CheckMark className="mt-0.5 shrink-0 text-[var(--lp-accent-2)]" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/register"
                    className={`mt-8 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition-all ${
                      p.highlight
                        ? "bg-white text-black hover:-translate-y-0.5"
                        : "border border-white/15 bg-white/5 text-white hover:bg-white/10"
                    }`}
                  >
                    {p.cta}
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ------------------------------- FAQ ------------------------------ */}
        <section id="faq" className="mx-auto w-full max-w-3xl scroll-mt-24 px-5 py-20">
          <Reveal>
            <div className="text-center">
              <SectionLabel center>FAQ</SectionLabel>
              <h2 className="font-display mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Questions, answered.
              </h2>
            </div>
          </Reveal>
          <Reveal delay={100} className="mt-10">
            <Faq items={FAQS} />
          </Reveal>
        </section>

        {/* ------------------------------- CTA ------------------------------ */}
        <section className="mx-auto w-full max-w-6xl px-5 py-20">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 px-6 py-16 text-center sm:py-20">
              <div
                className="lp-aurora pointer-events-none absolute left-1/2 top-1/2 h-[120%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(var(--lp-accent-rgb),0.35),_transparent_60%)] blur-2xl"
                aria-hidden
              />
              <div className="relative">
                <h2 className="font-display mx-auto max-w-2xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
                  Give your business a voice that never sleeps.
                </h2>
                <p className="mx-auto mt-5 max-w-lg text-pretty text-white/55">
                  Set up your AI receptionist in minutes and test a real call in your
                  browser — free.
                </p>
                <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    href="/register"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-black shadow-[0_8px_40px_-8px_rgba(255,255,255,0.5)] transition-transform hover:-translate-y-0.5"
                  >
                    Get started free →
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                  >
                    Sign in
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ------------------------------ FOOTER ----------------------------- */}
      <footer className="relative z-10 border-t border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-white/40 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-[var(--lp-accent)] to-[var(--lp-accent-2)] text-xs font-bold text-black">
              O
            </span>
            <span className="text-white/70">OvozAI</span>
            <span>— AI voice agents for Uzbekistan</span>
          </div>
          <span>© {year} OvozAI</span>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------- building blocks ------------------------------ */

const MARQUEE = [
  "O'zbekcha",
  "Русский",
  "English",
  "Appointments",
  "Knowledge base",
  "Human handoff",
  "24/7",
];

function SectionLabel({ children, center = false }: { children: ReactNode; center?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${center ? "justify-center" : ""}`}>
      <span className="h-px w-6 bg-gradient-to-r from-[var(--lp-accent)] to-[var(--lp-accent-2)]" />
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
        {children}
      </span>
    </div>
  );
}

function Check({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <CheckMark className="text-emerald-400" />
      {children}
    </span>
  );
}

function BackgroundFX() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {/* aurora blobs — CSS fallback behind the shader */}
      <div className="lp-aurora absolute -top-40 left-1/4 h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle,_rgba(var(--lp-accent-rgb),0.22),_transparent_60%)] blur-3xl" />
      <div
        className="lp-aurora absolute -top-24 right-0 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,_rgba(var(--lp-accent-2-rgb),0.16),_transparent_60%)] blur-3xl"
        style={{ animationDelay: "-6s" }}
      />
      {/* WebGL shader (covers the blobs when available) */}
      <ShaderCanvas />
      {/* grid */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 80% 50% at 50% 0%, black, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 50% at 50% 0%, black, transparent 75%)",
        }}
      />
    </div>
  );
}

/** The hero's glassy "live call" card with an animated waveform. */
function CallCard() {
  return (
    <div className="lp-float relative mx-auto max-w-md">
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-[rgba(var(--lp-accent-rgb),0.2)] to-[rgba(var(--lp-accent-2-rgb),0.1)] blur-2xl" aria-hidden />
      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[var(--lp-accent)] to-[var(--lp-accent-2)] text-black">
              <PhoneIcon />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">Klinika Qabulxonasi</p>
              <p className="text-xs text-white/45">Incoming call · Uzbek</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Live
          </span>
        </div>

        {/* waveform */}
        <div className="mt-6 flex h-16 items-center justify-center gap-1 rounded-xl border border-white/5 bg-black/20">
          {WAVE.map((h, i) => (
            <span
              key={i}
              className="lp-bar w-1 rounded-full bg-gradient-to-t from-[var(--lp-accent)] to-[var(--lp-accent-2)]"
              style={{ height: `${h}%`, animationDelay: `${i * 70}ms` }}
            />
          ))}
        </div>

        {/* mini transcript */}
        <div className="mt-6 flex flex-col gap-3">
          <Bubble side="caller" lang="Caller">
            Ertaga soat 15:00 ga yozsangiz.
          </Bubble>
          <Bubble side="agent" lang="OvozAI">
            15:00 band. Soat 15:30 yoki 16:00 bo‘sh — qaysi biri qulay?
          </Bubble>
        </div>
      </div>
    </div>
  );
}

function TranscriptCard() {
  const turns = [
    { who: "Caller", uz: "Assalomu alaykum, qabulga yozmoqchiman.", agent: false },
    { who: "OvozAI", uz: "Albatta! Qaysi kun va soatga yozamiz?", agent: true },
    { who: "Caller", uz: "Payshanba kuni ertalab.", agent: false },
    { who: "OvozAI", uz: "Payshanba 09:00 bo‘sh. Ismingizni ayting, band qilaman.", agent: true },
  ];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-3">
        <span className="flex items-center gap-2 text-xs text-white/50">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Call transcript · live
        </span>
        <span className="text-xs text-white/30">00:24</span>
      </div>
      <div className="flex flex-col gap-3">
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.agent ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                t.agent
                  ? "bg-gradient-to-br from-[rgba(var(--lp-accent-rgb),0.3)] to-[rgba(var(--lp-accent-2-rgb),0.2)] text-white"
                  : "bg-white/5 text-white/80"
              }`}
            >
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-white/40">{t.who}</p>
              {t.uz}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bubble({
  side,
  lang,
  children,
}: {
  side: "caller" | "agent";
  lang: string;
  children: ReactNode;
}) {
  const agent = side === "agent";
  return (
    <div className={`flex ${agent ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-[13px] leading-snug ${
          agent
            ? "bg-gradient-to-br from-[rgba(var(--lp-accent-rgb),0.3)] to-[rgba(var(--lp-accent-2-rgb),0.2)] text-white"
            : "bg-white/5 text-white/80"
        }`}
      >
        <p className="mb-0.5 text-[10px] uppercase tracking-wide text-white/40">{lang}</p>
        {children}
      </div>
    </div>
  );
}

const WAVE = [30, 55, 80, 45, 95, 60, 35, 70, 100, 50, 75, 40, 85, 55, 30, 65, 90, 45, 60, 35];

/* --------------------------------- icons --------------------------------- */

function CheckMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function GlobeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2V5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 3v18" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
function HandoffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 12h12m0 0-4-4m4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="12" r="2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
