import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OvozAI — AI Voice Receptionist",
  description:
    "AI voice agents that answer calls in Uzbek, Russian, and English.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
