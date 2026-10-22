"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginRequestSchema } from "@ovozai/contracts";
import { Alert, Button } from "@ovozai/ui";
import { useAuth } from "@/lib/auth-context";
import { describeError, zodFieldErrors, type FieldErrors } from "@/lib/form";
import { FormField } from "@/components/form-field";
import { AuthShell } from "@/components/landing/auth-shell";

/** Read a safe, same-app redirect target from the `?next=` query parameter. */
function readNextParam(): string {
  if (typeof window === "undefined") return "/dashboard";
  const next = new URLSearchParams(window.location.search).get("next");
  // Only allow in-app absolute paths to avoid open-redirects.
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/dashboard";
}

export default function LoginPage() {
  const router = useRouter();
  const { status, login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in: skip the form.
  useEffect(() => {
    if (status === "authenticated") {
      router.replace(readNextParam());
    }
  }, [status, router]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = loginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      await login(parsed.data);
      router.replace(readNextParam());
    } catch (error) {
      const described = describeError(error);
      setFormError(described.message);
      setFieldErrors(described.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your OvozAI dashboard."
      footer={
        <>
          No account?{" "}
          <Link href="/register" className="font-medium text-white underline underline-offset-4">
            Create one
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        {formError ? <Alert variant="destructive">{formError}</Alert> : null}

        <FormField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          required
        />
        <FormField
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          required
        />

        <Button type="submit" disabled={submitting} className="mt-1 w-full rounded-full">
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
