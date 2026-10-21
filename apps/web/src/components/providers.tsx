"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth-context";

/** App-wide client providers mounted once at the root layout. */
export function Providers({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
