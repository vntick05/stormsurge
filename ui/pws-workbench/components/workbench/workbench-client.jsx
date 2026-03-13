"use client";

import { useState, useTransition } from "react";

import {
  AlertCircle,
  CheckCircle2,
  CircleStack,
  ChevronDown,
  ChevronRight,
  Flag,
  FolderTree,
  Layers3,
  LoaderCircle,
  MessageSquareText,
  PanelLeftClose,
  ScanSearch,
  Upload,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { buildWorkspace, emptyWorkspace, markSelectedTree, setReviewStatus } from "@/lib/workspace";

const REVIEW_OPTIONS = [
  {
    value: "unreviewed",
    label: "Unreviewed",
    description: "Not reviewed yet",
    icon: Flag,
    tone: "neutral",
  },
  {
    value: "accepted",
    label: "Accepted",
    description: "Structure looks correct",
    icon: CheckCircle2,
    tone: "success",
  },
  {
    value: "needs-review",
    label: "Needs Review",
    description: "Something looks questionable",
    icon: AlertCircle,
    tone: "warn",
  },
  {
    value: "bad-extract",
    label: "Bad Extract",
    description: "Structure is wrong and needs rework",
    icon: XCircle,
    tone: "danger",
  },
];

function StatCard({ label, value, caption }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        {label}
      </div>
      <div className="mt-2 text-[22px] font-semibold tracking-[-0.02em]">{value}</div>
      <div className="mt-1 text-xs text-[var(--muted-foreground)]">{caption}</div>
    </div>
  );
}

function UploadPanel({ documentName, stats, error, isPending, onUpload }) {
  function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const primaryFile = formData.get("file");
    if (!(primaryFile instanceof File) || !primaryFile.name) {
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
          <CardTitle className="mt-2 text-base">Upload one PWS document</CardTitle>
          <CardDescription>
            Run the deterministic structuring pipeline and open the extracted hierarchy for review.
          </CardDescription>
        </div>
        <Badge tone="accent">Single-document flow</Badge>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form onSubmit={handleSubmit} className="grid gap-4 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
          <label className="grid gap-2 text-sm">
            <span className="font-medium">PWS file</span>
            <input
              name="file"
              type="file"
              accept=".doc,.docx,.pdf,.txt,.md"
              className="block w-full rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--panel)] px-3 py-3 text-sm"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted-foreground)]">
            <span>Supported: PDF, DOCX, TXT, Markdown</span>
            <span>Hierarchy only. No retrieval or assistant yet.</span>
          </div>
          {error ? (
            <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            <Button className="gap-2" disabled={isPending} type="submit">
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isPending ? "Running structuring pipeline" : "Build hierarchy"}
            </Button>
            <div className="text-xs text-[var(--muted-foreground)]">Current file: {documentName || "None loaded"}</div>
          </div>
        </form>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Sections" value={stats.sections} caption="Detected section and subsection nodes" />
          <StatCard label="Content Blocks" value={stats.blocks} caption="Paragraph, bullet, and table-text blocks" />
          <StatCard label="Review Items" value={stats.reviewableItems} caption="Sections and content nodes available for review" />
        </div>
      </CardContent>
    </Card>
  );
}

function OutlineNode({ node, depth = 0, onSelect }) {
  const hasChildren = Boolean(node.children?.length);
  const statusMeta = REVIEW_OPTIONS.find((item) => item.value === node.reviewStatus) || REVIEW_OPTIONS[0];

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={cn(
          "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
          node.selected
            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
            : "border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-subtle)]",
        )}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        <div className="flex h-5 w-5 items-center justify-center text-[var(--muted-foreground)]">
          {hasChildren ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4 opacity-0" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-sm", node.type !== "paragraph" && "font-semibold")}>{node.label}</div>
          <div className="mt-1 text-xs text-[var(--muted-foreground)]">{node.meta}</div>
        </div>
        <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
      </button>
      {hasChildren ? (
        <div className="mt-1 space-y-1">
          {node.children.map((child) => (
            <OutlineNode key={child.id} node={child} depth={depth + 1} onSelect={onSelect} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function OutlinePanel({ tree, selectedId, onSelect }) {
  return (
    <Card className="min-h-[720px] overflow-hidden">
      <CardHeader className="items-start">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Hierarchy
          </div>
          <CardTitle className="mt-2 text-base">Extracted document outline</CardTitle>
          <CardDescription>Review the exact section numbering and the attached content blocks beneath each node.</CardDescription>
        </div>
        {selectedId ? <Badge tone="accent">{selectedId}</Badge> : null}
      </CardHeader>
      <CardContent className="max-h-[780px] space-y-1 overflow-auto bg-[var(--surface-subtle)]">
        {tree.length ? (
          tree.map((node) => <OutlineNode key={node.id} node={node} onSelect={onSelect} />)
        ) : (
          <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-10 text-sm text-[var(--muted-foreground)]">
            No PWS loaded yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewToolbar({ detail, onStatusChange, onNoteChange }) {
  if (!detail) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="items-start">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Review
          </div>
          <CardTitle className="mt-2 text-base">Mark extract quality</CardTitle>
          <CardDescription>Use this to flag bad structure or questionable attachment before later phases.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          {REVIEW_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = detail.reviewStatus === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onStatusChange(detail.id, option.value)}
                className={cn(
                  "flex items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors",
                  active ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--panel)] hover:bg-[var(--surface-subtle)]",
                )}
              >
                <Icon className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
                <div>
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="mt-1 text-xs text-[var(--muted-foreground)]">{option.description}</div>
                </div>
              </button>
            );
          })}
        </div>
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Review notes</span>
          <textarea
            value={detail.reviewNote}
            onChange={(event) => onNoteChange(detail.id, event.target.value)}
            placeholder="Document why this extract is right, questionable, or bad."
            className="min-h-28 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-3 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring)]"
          />
        </label>
      </CardContent>
    </Card>
  );
}

function DetailPanel({ detail }) {
  if (!detail) {
    return (
      <Card className="min-h-[720px]">
        <CardHeader className="items-start">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Inspect
            </div>
            <CardTitle className="mt-2 text-base">Selected extract</CardTitle>
            <CardDescription>Choose a section or a content node to inspect its attached text.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-10 text-sm text-[var(--muted-foreground)]">
            Nothing selected yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="min-h-[720px]">
      <CardHeader className="items-start">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Inspect
          </div>
          <CardTitle className="mt-2 text-base">{detail.title}</CardTitle>
          <CardDescription>{detail.context}</CardDescription>
        </div>
        <Badge tone="accent">{detail.typeLabel}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {detail.metrics.map((metric) => (
            <div key={metric.label} className="rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                {metric.label}
              </div>
              <div className="mt-2 text-sm font-medium">{metric.value}</div>
            </div>
          ))}
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-subtle)]">
          <div className="border-b border-[var(--border)] px-4 py-3 text-sm font-medium">Attached content</div>
          <div className="space-y-4 px-4 py-4">
            {detail.blocks.length ? (
              detail.blocks.map((block) => (
                <div key={block.id} className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                      {block.typeLabel}
                    </span>
                    <span className="text-[var(--muted-foreground)]">{block.id}</span>
                  </div>
                  {block.type === "bullet" ? (
                    <div className="flex gap-3 text-sm leading-7">
                      <span className="font-medium text-[var(--muted-foreground)]">{block.marker}</span>
                      <span>{block.text}</span>
                    </div>
                  ) : (
                    <div className="text-sm leading-7 whitespace-pre-wrap">{block.text}</div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-sm text-[var(--muted-foreground)]">No attached content blocks were produced for this node.</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewQueue({ reviewItems, onSelect }) {
  return (
    <Card>
      <CardHeader className="items-start">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Queue
          </div>
          <CardTitle className="mt-2 text-base">Flagged and pending review items</CardTitle>
          <CardDescription>Keep the intermediate extract inspectable instead of jumping to final outputs.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-[minmax(0,1.2fr)_130px_130px] border-b border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          <div>Item</div>
          <div>Status</div>
          <div>Type</div>
        </div>
        <div className="max-h-[280px] overflow-auto">
          {reviewItems.length ? (
            reviewItems.map((item) => {
              const statusMeta = REVIEW_OPTIONS.find((option) => option.value === item.reviewStatus) || REVIEW_OPTIONS[0];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="grid w-full grid-cols-[minmax(0,1.2fr)_130px_130px] items-start gap-3 border-b border-[var(--border)] px-4 py-3 text-left text-sm last:border-b-0 hover:bg-[var(--surface-subtle)]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.title}</div>
                    <div className="mt-1 truncate text-xs text-[var(--muted-foreground)]">{item.context}</div>
                  </div>
                  <div>
                    <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                  </div>
                  <div className="text-[var(--muted-foreground)]">{item.typeLabel}</div>
                </button>
              );
            })
          ) : (
            <div className="px-4 py-8 text-sm text-[var(--muted-foreground)]">No review items yet.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AssistantReadyCard() {
  return (
    <Card>
      <CardHeader className="items-start">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Next Phase
          </div>
          <CardTitle className="mt-2 text-base">Assistant integration placeholder</CardTitle>
          <CardDescription>The app is structured so the existing LLM service can be added later without changing the core review flow.</CardDescription>
        </div>
        <Badge tone="neutral">Not active</Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-[var(--muted-foreground)]">
        <div className="flex items-start gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3">
          <Layers3 className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
          <div>Use the hierarchy and review state as the stable context layer before introducing assistant actions.</div>
        </div>
        <div className="flex items-start gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3">
          <MessageSquareText className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
          <div>Later assistant features can focus on explanation, repair suggestions, and extraction help without becoming the parser.</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function WorkbenchClient({ initialWorkspace }) {
  const [workspace, setWorkspace] = useState(initialWorkspace || emptyWorkspace);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleSelect(itemId) {
    setWorkspace((current) => ({
      ...current,
      selectedId: itemId,
      tree: markSelectedTree(current.tree, itemId),
    }));
  }

  function handleUpload({ primaryFile }) {
    startTransition(async () => {
      setError("");
      const formData = new FormData();
      formData.append("file", primaryFile);

      const response = await fetch("/api/outline", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.detail || "Unable to build hierarchy");
        return;
      }

      setWorkspace(buildWorkspace(payload));
    });
  }

  function handleStatusChange(itemId, status) {
    setWorkspace((current) => setReviewStatus(current, itemId, { reviewStatus: status }));
  }

  function handleNoteChange(itemId, reviewNote) {
    setWorkspace((current) => setReviewStatus(current, itemId, { reviewNote }));
  }

  const selectedDetail = workspace.selectedId ? workspace.details[workspace.selectedId] : null;

  return (
    <div className="min-h-screen p-4 lg:p-5">
      <div className="grid min-h-[calc(100vh-2rem)] grid-cols-1 overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--panel)] shadow-[0_20px_60px_rgba(15,23,42,0.08)] lg:grid-cols-[92px_minmax(0,1fr)]">
        <aside className="border-b border-[var(--border)] bg-[linear-gradient(180deg,#111827_0%,#0f172a_100%)] px-3 py-4 text-white lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between lg:block">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-white/6 ring-1 ring-white/10">
              <FolderTree className="h-5 w-5" />
            </div>
            <div className="hidden lg:block">
              <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">Perfect</div>
              <div className="mt-1 text-sm font-semibold tracking-[0.02em]">PWS</div>
            </div>
            <button className="rounded-md p-2 text-white/60 hover:bg-white/6 hover:text-white lg:mt-8 lg:block">
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-6 flex gap-2 lg:mt-10 lg:flex-col">
            {[
              { icon: CircleStack, label: "Ingest" },
              { icon: ScanSearch, label: "Review" },
              { icon: Layers3, label: "Assist" },
            ].map((item, index) => {
              const Icon = item.icon;
              const active = index === 0;
              return (
                <div
                  key={item.label}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-md ring-1 ring-inset",
                    active ? "bg-white text-slate-950 ring-white" : "bg-white/5 text-white/70 ring-white/10",
                  )}
                  title={item.label}
                >
                  <Icon className="h-4 w-4" />
                </div>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0 bg-[var(--background)]">
          <header className="border-b border-[var(--border)] bg-[var(--panel)] px-5 py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  PWS Structuring Review
                </div>
                <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                  Inspect the hierarchy before anything downstream touches it
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--muted-foreground)]">
                  Single-document structuring, readable hierarchy, explicit review states, and no fake polish hiding bad extraction.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[560px]">
                <StatCard label="Loaded Document" value={workspace.primaryDocument === "No PWS loaded" ? "0" : "1"} caption={workspace.primaryDocument} />
                <StatCard label="Flagged Items" value={workspace.stats.flaggedItems} caption="Needs review or bad extract" />
                <StatCard label="Accepted Items" value={workspace.stats.acceptedItems} caption="Reviewed and accepted" />
              </div>
            </div>
          </header>

          <div className="grid gap-5 p-5 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="space-y-5">
              <UploadPanel
                documentName={workspace.primaryDocument}
                stats={workspace.stats}
                error={error}
                isPending={isPending}
                onUpload={handleUpload}
              />
              <ReviewQueue reviewItems={workspace.reviewQueue} onSelect={handleSelect} />
              <AssistantReadyCard />
            </div>

            <div className="grid min-h-[720px] gap-5 2xl:grid-cols-[380px_minmax(0,1fr)_360px]">
              <OutlinePanel tree={workspace.tree} selectedId={workspace.selectedId} onSelect={handleSelect} />
              <DetailPanel detail={selectedDetail} />
              <ReviewToolbar detail={selectedDetail} onStatusChange={handleStatusChange} onNoteChange={handleNoteChange} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
