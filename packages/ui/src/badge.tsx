import * as React from "react";
import { cn } from "./lib/utils";

export type BadgeVariant = "default" | "secondary" | "outline" | "success" | "destructive";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-transparent bg-accent text-accent-foreground",
  outline: "border-border text-foreground",
  success: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  destructive: "border-transparent bg-red-500/15 text-red-700 dark:text-red-400",
};

/** Compact status/role pill. */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant = "default", ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
});
