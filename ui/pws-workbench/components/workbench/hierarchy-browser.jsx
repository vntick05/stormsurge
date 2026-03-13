import { ChevronDown, ChevronRight, FileText, ListTree } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function Node({ node, depth = 0, onSelect }) {
  const hasChildren = Boolean(node.children?.length);
  return (
    <div>
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
          node.selected ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "hover:bg-[var(--background)]",
        )}
        style={{ paddingLeft: `${depth * 14 + 12}px` }}
        onClick={() => onSelect?.(node.id)}
      >
        {hasChildren ? (node.expanded || depth < 2 ? <ChevronDown className="h-4 w-4 text-[var(--muted-foreground)]" /> : <ChevronRight className="h-4 w-4 text-[var(--muted-foreground)]" />) : <FileText className="h-4 w-4 text-[var(--muted-foreground)]" />}
        <span className={cn(node.type !== "paragraph" && "font-medium")}>{node.label}</span>
      </button>
      {hasChildren ? (
        <div className="space-y-1">
          {node.children.map((child) => (
            <Node key={child.id} node={child} depth={depth + 1} onSelect={onSelect} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function HierarchyBrowser({ tree, onSelect }) {
  return (
    <Card className="min-h-[420px]">
      <CardHeader className="items-start">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Outline
          </div>
          <CardTitle className="mt-2 text-base">PWS hierarchy</CardTitle>
          <CardDescription>Section numbering should match the document exactly. Select a paragraph to inspect evidence.</CardDescription>
        </div>
        <ListTree className="h-4 w-4 text-[var(--muted-foreground)]" />
      </CardHeader>
      <CardContent className="max-h-[520px] space-y-1 overflow-auto">
        {tree.length ? (
          tree.map((node) => <Node key={node.id} node={node} onSelect={onSelect} />)
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-6 text-sm text-[var(--muted-foreground)]">
            No outline yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
