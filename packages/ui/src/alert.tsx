import * as React from "react";
import { cn } from "./lib/utils";

export type AlertVariant = "default" | "destructive" | "success";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
}

const variantClasses: Record<AlertVariant, string> = {
  default: "border-border bg-accent/40 text-foreground",
  destructive: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

/** Inline message block for form/problem feedback. Renders `role="alert"`. */
export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { className, variant = "default", ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      role="alert"
      className={cn("rounded-md border px-4 py-3 text-sm", variantClasses[variant], className)}
      {...props}
    />
  );
});

export type AlertTitleProps = React.HTMLAttributes<HTMLHeadingElement>;

export const AlertTitle = React.forwardRef<HTMLHeadingElement, AlertTitleProps>(function AlertTitle(
  { className, ...props },
  ref,
) {
  return <h4 ref={ref} className={cn("mb-1 font-medium", className)} {...props} />;
});

export type AlertDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>;

export const AlertDescription = React.forwardRef<HTMLParagraphElement, AlertDescriptionProps>(
  function AlertDescription({ className, ...props }, ref) {
    return <p ref={ref} className={cn("text-sm [&_p]:leading-relaxed", className)} {...props} />;
  },
);
