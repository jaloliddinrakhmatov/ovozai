"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle } from "@ovozai/ui";
import { useAuth } from "@/lib/auth-context";
import { describeError } from "@/lib/form";

type AcceptState =
  | { kind: "pending" }
  | { kind: "accepting" }
  | { kind: "accepted"; organization: string | null }
  | { kind: "error"; message: string };

export default function AcceptInvitePage() {
  const router = useRouter();
  const { status, acceptInvitation } = useAuth();
  const [state, setState] = useState<AcceptState>({ kind: "pending" });
  // Guard against double-accept in React Strict Mode / re-renders.
  const startedRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || startedRef.current) return;

    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setState({ kind: "error", message: "This invitation link is missing its token." });
      return;
    }

    startedRef.current = true;
    setState({ kind: "accepting" });

    void (async () => {
      try {
        await acceptInvitation(token);
        setState({ kind: "accepted", organization: null });
      } catch (error) {
        setState({ kind: "error", message: describeError(error).message });
      }
    })();
  }, [status, acceptInvitation]);

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Accept invitation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {(state.kind === "pending" || state.kind === "accepting") && (
            <p className="text-sm text-muted-foreground" role="status">
              Joining the organization…
            </p>
          )}

          {state.kind === "accepted" && (
            <>
              <Alert variant="success">
                You have joined the organization. It is now your active organization.
              </Alert>
              <Button onClick={() => router.replace("/dashboard")}>Go to dashboard</Button>
            </>
          )}

          {state.kind === "error" && (
            <>
              <Alert variant="destructive">{state.message}</Alert>
              <Link href="/dashboard" className="text-sm font-medium underline">
                Back to dashboard
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
