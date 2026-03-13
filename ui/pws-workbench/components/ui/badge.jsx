import { cn } from "@/lib/utils";

const tones = {
  neutral: "border border-[var(--border)] bg-[var(--panel-strong)] text-[var(--muted-foreground)]",
  accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
  success: "bg-[var(--success-soft)] text-[var(--success)]",
  warn: "bg-[var(--warning-soft)] text-[var(--warning)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
};

export function Badge({ tone = "neutral", className, ...props }) {
  return <span className={cn("inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium", tones[tone], className)} {...props} />;
}
