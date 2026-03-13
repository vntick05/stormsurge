import { cn } from "@/lib/utils";

export function Card({ className, ...props }) {
  return <div className={cn("rounded-md border border-[var(--border)] bg-[var(--panel)] shadow-[0_1px_2px_rgba(15,23,42,0.03),0_12px_28px_rgba(15,23,42,0.04)]", className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div className={cn("flex items-start justify-between gap-4 border-b border-[var(--border)] px-4 py-3.5", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cn("text-sm font-semibold tracking-[-0.01em]", className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn("text-[13px] leading-6 text-[var(--muted-foreground)]", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn("px-4 py-4", className)} {...props} />;
}
