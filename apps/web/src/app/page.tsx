import { Button } from "@ovozai/ui";
import { BackendStatus } from "@/components/backend-status";

interface Feature {
  title: string;
  description: string;
}

const FEATURES: readonly Feature[] = [
  {
    title: "Multilingual",
    description:
      "Natural conversations in Uzbek, Russian, and English — the caller's language, detected automatically.",
  },
  {
    title: "Appointments",
    description:
      "Books, reschedules, and confirms appointments straight into your calendar while the caller is on the line.",
  },
  {
    title: "Knowledge base",
    description:
      "Answers questions about hours, pricing, and services from your own content — no scripting required.",
  },
  {
    title: "Human handoff",
    description:
      "Recognizes when a call needs a person and transfers it to your team with the full context.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
          <span className="text-lg font-semibold tracking-tight">
            Ovoz<span className="text-muted-foreground">AI</span>
          </span>
          <nav aria-label="Primary">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 py-16 sm:py-24">
          <div className="flex max-w-2xl flex-col gap-6">
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              AI voice receptionists for Uzbekistan
            </h1>
            <p className="text-lg text-muted-foreground text-pretty">
              OvozAI answers your calls in Uzbek, Russian, and English — booking
              appointments, answering questions, and transferring to a human the
              moment a call needs one.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button size="lg">Get started</Button>
              <Button variant="outline" size="lg">
                View docs
              </Button>
            </div>

            <div className="pt-2">
              <BackendStatus />
            </div>

            <p className="text-sm text-muted-foreground">
              Phase 1 foundation — this page is wired to the OvozAI API and
              reports the live backend connection above.
            </p>
          </div>
        </section>

        <section
          aria-labelledby="features-heading"
          className="border-t border-border"
        >
          <div className="mx-auto w-full max-w-5xl px-4 py-16">
            <h2
              id="features-heading"
              className="text-2xl font-semibold tracking-tight"
            >
              What it does
            </h2>
            <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature) => (
                <li
                  key={feature.title}
                  className="rounded-lg border border-border bg-accent/30 p-5"
                >
                  <h3 className="font-medium">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 text-sm text-muted-foreground">
          © {new Date().getFullYear()} OvozAI. AI voice agents for Uzbekistan.
        </div>
      </footer>
    </div>
  );
}
