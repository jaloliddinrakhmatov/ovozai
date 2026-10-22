"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { registerRequestSchema } from "@ovozai/contracts";
import { Alert, Button } from "@ovozai/ui";
import { useAuth } from "@/lib/auth-context";
import { describeError, zodFieldErrors, type FieldErrors } from "@/lib/form";
import { FormField } from "@/components/form-field";
import { AuthShell } from "@/components/landing/auth-shell";

export default function RegisterPage() {
  const router = useRouter();
  const { status, register } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = registerRequestSchema.safeParse({
      email,
      password,
      // Omit the optional name entirely when blank.
      ...(name.trim() ? { name: name.trim() } : {}),
    });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      await register(parsed.data);
      router.replace("/dashboard");
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
      title="Create your account"
      subtitle="Launch your AI voice receptionist — free, in minutes."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-white underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        {formError ? <Alert variant="destructive">{formError}</Alert> : null}

        <FormField
          label="Name"
          type="text"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          placeholder="Optional"
        />
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          required
        />

        <Button type="submit" disabled={submitting} className="mt-1 w-full rounded-full">
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
