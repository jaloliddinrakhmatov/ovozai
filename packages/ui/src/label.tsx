import * as React from "react";
import { cn } from "./lib/utils";

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

/** A form label styled to match the OvozAI theme. */
export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, ...props },
  ref,
) {
  return (
    <label
      ref={ref}
      className={cn(
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
});
