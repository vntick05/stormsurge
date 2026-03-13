import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
export function ReviewQueue({ rows, onSelect, selectedId }) {
  return (
    <Card>
      <CardHeader className="items-start">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Sections
          </div>
          <CardTitle className="mt-2 text-base">Top-level sections</CardTitle>
          <CardDescription>Quick jumps to the major sections in the loaded PWS.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2">
        {rows.length ? (
          rows.map((row) => (
            <button
              key={row.item}
              className={`rounded-md border px-3 py-3 text-left text-sm transition-colors ${selectedId === row.item ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--background)] hover:bg-[var(--panel-strong)]"}`}
              onClick={() => onSelect?.(row.item)}
            >
              <div className="font-medium">{row.item}</div>
              <div className="mt-1 text-xs text-[var(--muted-foreground)]">{row.title}</div>
            </button>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-6 text-sm text-[var(--muted-foreground)]">
            No sections loaded yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
