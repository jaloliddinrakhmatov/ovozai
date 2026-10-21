"use client";

import { useState } from "react";
import { Button } from "@ovozai/ui";

export interface CopyFieldProps {
  label: string;
  value: string;
}

/** A read-only value with a copy-to-clipboard button. */
export function CopyField({ label, value }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground">
          {value}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={() => void onCopy()}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
