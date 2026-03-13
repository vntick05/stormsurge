import { useRef, useState } from "react";

import { ArrowUpRight, FileUp, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
export function UploadFlow({ documentName, stats, error, isPending, onUpload }) {
  const primaryRef = useRef(null);

  function handleSubmit(event) {
    event.preventDefault();
    const primaryFile = primaryRef.current?.files?.[0];
    if (!primaryFile || !onUpload) {
      return;
    }
    onUpload({ primaryFile });
  }

  return (
    <Card>
      <CardHeader className="items-start">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Ingest
          </div>
          <CardTitle className="mt-2 text-base">Upload a PWS and build the hierarchy</CardTitle>
          <CardDescription>Single-document flow only. Parse the file, preserve the numbering, and render the section outline for review.</CardDescription>
        </div>
        <Button className="gap-2" type="submit" form="upload-form" disabled={isPending}>
          <Upload className="h-4 w-4" />
          {isPending ? "Building..." : "Build hierarchy"}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <form id="upload-form" className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm">
            <span className="font-medium">PWS file</span>
            <input ref={primaryRef} type="file" accept=".doc,.docx,.pdf,.txt,.md" className="block w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm" />
          </label>
          <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
            <span>Upload a single PDF, DOCX, TXT, or Markdown PWS.</span>
            <span>The hierarchy opens in the browser for review.</span>
          </div>
          {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-200">{error}</div> : null}
        </form>
        <div className="grid gap-3">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)]">
            <div className="border-b border-[var(--border)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              Current document
            </div>
            <div className="grid gap-4 px-3 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--panel)]">
                  <FileUp className="h-4 w-4 text-[var(--accent)]" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{documentName || "No PWS loaded"}</div>
                  <div className="mt-1 text-xs text-[var(--muted-foreground)]">Once uploaded, the hierarchy renders below with preserved section numbering.</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  ["Sections", String(stats.sections || 0)],
                  ["Paragraphs", String(stats.paragraphs || 0)],
                  ["Bullets", String(stats.bullets || 0)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">{label}</div>
                    <div className="mt-2 text-base font-semibold">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
            <div className="flex items-center gap-2">
              <FileUp className="h-3.5 w-3.5" />
              Backend service available on `:8193`
            </div>
            <a href="http://127.0.0.1:8193/" className="inline-flex items-center gap-1 text-[var(--accent)]">
              Open service
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
