import { Bell, Command, Search, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function Topbar() {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
      <div className="relative max-w-xl flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <Input defaultValue="Find requirement, cite, appendix, or section" className="h-10 pl-9 pr-24" />
        <div className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[11px] text-[var(--muted-foreground)]">
          <Command className="h-3 w-3" />K
        </div>
      </div>
      <Button variant="secondary" className="h-10 gap-2">
        <SlidersHorizontal className="h-4 w-4" />
        Filters
      </Button>
      <Button variant="ghost" className="h-10 w-10 px-0">
        <Bell className="h-4 w-4" />
      </Button>
    </div>
  );
}
