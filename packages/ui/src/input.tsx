import * as React from "react";
import { cn } from "./lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * A shadcn/ui-style text input. Relies on the consuming app's Tailwind theme to
 * define the semantic color tokens (`--input`, `--background`, `--ring`, ...).
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus-visible:ring-red-500",
        className,
      )}
      {...props}
    />
  );
});
