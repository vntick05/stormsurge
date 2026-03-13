import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

const styles = {
  primary: "bg-[var(--accent)] text-white hover:brightness-95",
  secondary: "border border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)] hover:bg-[var(--surface-subtle)]",
  ghost: "text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]",
};

export function Button({ asChild = false, variant = "primary", className, ...props }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
