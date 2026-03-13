import { FileText, ListTree } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
export function DetailPanel({ detail, stats }) {
  if (!detail) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="items-start">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                Detail
              </div>
              <CardTitle className="mt-2 text-base">Selected node</CardTitle>
              <CardDescription>Upload a PWS to inspect the hierarchy and exact text.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-[var(--muted-foreground)]">
            No section or paragraph selected yet.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="items-start">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Detail
            </div>
            <CardTitle className="mt-2 text-base">{detail.title}</CardTitle>
            <CardDescription>{detail.section}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 text-[var(--accent)]" />
              Extracted content
            </div>
            {detail.blocks?.length ? (
              <div className="space-y-4">
                {detail.blocks.map((block) => (
                  <div key={block.id} className="text-sm leading-7 text-[var(--foreground)]">
                    {block.type === "bullet" ? (
                      <div className="flex gap-3">
                        <span className="min-w-8 font-medium text-[var(--muted-foreground)]">{block.marker}</span>
                        <span>{block.text}</span>
                      </div>
                    ) : (
                      <div>{block.text}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm leading-7 text-[var(--muted-foreground)]">
                No extracted body content was attached to this node.
              </div>
            )}
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <ListTree className="h-4 w-4 text-[var(--accent)]" />
              Structure summary
            </div>
            {detail.summary.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 border-b border-[var(--border)] py-2 text-sm last:border-b-0">
                <span className="text-[var(--muted-foreground)]">{label}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
