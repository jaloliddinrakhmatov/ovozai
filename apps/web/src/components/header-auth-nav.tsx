"use client";

import { useRouter } from "next/navigation";
import { Button } from "@ovozai/ui";
import { useAuth } from "@/lib/auth-context";

/**
 * Landing-page header navigation. Points at the dashboard when authenticated,
 * otherwise at sign-in. Renders the signed-out label during the initial
 * loading phase so SSR and first client paint agree.
 */
export function HeaderAuthNav() {
  const router = useRouter();
  const { status } = useAuth();

  const authenticated = status === "authenticated";
  const href = authenticated ? "/dashboard" : "/login";
  const label = authenticated ? "Dashboard" : "Sign in";

  return (
    <Button variant="ghost" size="sm" onClick={() => router.push(href)}>
      {label}
    </Button>
  );
}
