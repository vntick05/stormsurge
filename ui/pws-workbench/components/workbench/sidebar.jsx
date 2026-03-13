import { Blocks, FileStack, FolderTree, SearchCode, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { navigationItems } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const icons = [Blocks, FolderTree, FileStack, SearchCode, ShieldCheck];

export function Sidebar() {
  return (
    <aside className="flex h-screen flex-col border-r border-[var(--border)] bg-[var(--sidebar)] px-3 py-4">
      <div className="px-2">
        <div className="text-base font-semibold tracking-tight">Perfect PWS</div>
        <div className="mt-1 text-xs text-[var(--muted-foreground)]">Requirement review</div>
      </div>
      <nav className="mt-8 space-y-1">
        {navigationItems.map((item, index) => {
          const Icon = icons[index] || Blocks;
          return (
            <button
              key={item.label}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm",
                item.active ? "bg-[var(--panel)] text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:bg-[var(--panel)] hover:text-[var(--foreground)]",
              )}
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
              {item.count ? <Badge>{item.count}</Badge> : null}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Current workspace</div>
        <div className="mt-2 text-sm font-medium">TO1 correlation</div>
      </div>
    </aside>
  );
}
