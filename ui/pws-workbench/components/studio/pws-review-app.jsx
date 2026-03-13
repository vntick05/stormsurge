"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleDot,
  FileUp,
  FolderTree,
  LoaderCircle,
  MessageSquareWarning,
  PanelRightOpen,
  ScanText,
  XCircle,
} from "lucide-react";

import { createWorkspace, emptyWorkspace, selectNode, updateReview } from "@/lib/pws-review-model";

const REVIEW_STATES = [
  { value: "unreviewed", label: "Unreviewed", tone: "var(--panel-strong)", text: "var(--ink-soft)", icon: CircleDot },
  { value: "accepted", label: "Accepted", tone: "var(--success-soft)", text: "var(--success)", icon: CheckCheck },
  { value: "needs-review", label: "Needs Review", tone: "var(--warning-soft)", text: "var(--warning)", icon: AlertTriangle },
  { value: "bad-extract", label: "Bad Extract", tone: "var(--danger-soft)", text: "var(--danger)", icon: XCircle },
];

function toneForStatus(status) {
  return REVIEW_STATES.find((item) => item.value === status) || REVIEW_STATES[0];
}

function ShellSection({ eyebrow, title, description, aside, children }) {
  return (
    <section className="rounded-[14px] border border-[var(--line)] bg-[var(--panel)]">
      <div className="flex flex-col gap-4 border-b border-[var(--line)] px-5 py-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">{eyebrow}</div>
          <h2 className="mt-2 text-[18px] font-semibold tracking-[-0.02em]">{title}</h2>
          {description ? <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--ink-soft)]">{description}</p> : null}
        </div>
        {aside}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function Metric({ label, value, caption }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-muted)] px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{value}</div>
      <div className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">{caption}</div>
    </div>
  );
}

function StatusPill({ status }) {
  const tone = toneForStatus(status);
  const Icon = tone.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.04em]"
      style={{ background: tone.tone, color: tone.text }}
    >
      <Icon className="h-3.5 w-3.5" />
      {tone.label}
    </span>
  );
}

function UploadBlock({ workspace, error, isPending, onUpload }) {
  function submit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || !file.name) {
      return;
    }
    onUpload(file);
  }

  return (
    <ShellSection
      eyebrow="Pipeline"
      title="Upload one PWS and build the review graph"
      description="Single-document structuring only. This stage is about clean hierarchy, inspectable content blocks, and explicit review state."
      aside={<StatusPill status={workspace.filename === "No PWS loaded" ? "unreviewed" : "accepted"} />}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form onSubmit={submit} className="grid gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel-muted)] p-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium">PWS source file</span>
            <input
              name="file"
              type="file"
              accept=".doc,.docx,.pdf,.txt,.md"
              className="block w-full rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--panel)] px-4 py-4 text-sm"
            />
          </label>
          <div className="grid gap-2 text-xs text-[var(--ink-soft)] sm:grid-cols-2">
            <div>Supported: PDF, DOCX, TXT, Markdown</div>
            <div className="sm:text-right">No retrieval, no assistant inference, no related documents</div>
          </div>
          {error ? (
            <div className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
              {error}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {isPending ? "Building hierarchy" : "Run structuring pipeline"}
            </button>
            <div className="text-sm text-[var(--ink-soft)]">{workspace.filename}</div>
          </div>
        </form>
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <Metric label="Sections" value={workspace.stats.sections} caption="All detected section and subsection nodes" />
          <Metric label="Blocks" value={workspace.stats.blocks} caption="Paragraph, bullet, and table-text blocks" />
          <Metric label="Reviewable" value={workspace.stats.reviewableItems} caption="Items you can inspect and mark" />
        </div>
      </div>
    </ShellSection>
  );
}

function TreeNode({ node, depth, onSelect }) {
  const hasChildren = Boolean(node.children?.length);
  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors"
        style={{
          paddingLeft: `${depth * 18 + 14}px`,
          background: node.selected ? "var(--accent-soft)" : "transparent",
          border: node.selected ? "1px solid var(--accent)" : "1px solid transparent",
        }}
      >
        <div className="mt-0.5 h-4 w-4 text-[var(--ink-soft)]">{hasChildren ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4 opacity-30" />}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{node.label}</div>
          <div className="mt-1 text-xs text-[var(--ink-soft)]">{node.meta}</div>
        </div>
        <StatusPill status={node.reviewStatus} />
      </button>
      {hasChildren ? (
        <div className="mt-1 space-y-1">
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} onSelect={onSelect} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HierarchyPane({ workspace, onSelect }) {
  return (
    <ShellSection
      eyebrow="Hierarchy"
      title="Review the extracted structure"
      description="This is the primary review surface. Verify numbering, section attachment, and content placement before anything else happens."
      aside={<div className="rounded-full bg-[var(--panel-strong)] px-3 py-1 text-xs font-semibold text-[var(--ink-soft)]">{workspace.selectedId || "No selection"}</div>}
    >
      <div className="h-[820px] overflow-auto rounded-xl border border-[var(--line)] bg-[var(--panel-muted)] p-3">
        {workspace.tree.length ? (
          workspace.tree.map((node) => <TreeNode key={node.id} node={node} depth={0} onSelect={onSelect} />)
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-[var(--line)] text-sm text-[var(--ink-soft)]">
            Upload a PWS to populate the hierarchy.
          </div>
        )}
      </div>
    </ShellSection>
  );
}

function ExtractPane({ detail }) {
  return (
    <ShellSection
      eyebrow="Inspect"
      title={detail ? detail.title : "Selected extract"}
      description={detail ? detail.context : "Pick a section or content node to inspect the extracted text blocks."}
      aside={detail ? <StatusPill status={detail.reviewStatus} /> : null}
    >
      {detail ? (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {detail.metrics.map((metric) => (
              <Metric key={metric.label} label={metric.label} value={metric.value} caption="" />
            ))}
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-muted)]">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <div className="text-sm font-semibold">Attached content blocks</div>
              <div className="text-xs text-[var(--ink-soft)]">{detail.blocks.length} block(s)</div>
            </div>
            <div className="space-y-3 px-4 py-4">
              {detail.blocks.length ? (
                detail.blocks.map((block) => (
                  <div key={block.id} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">{block.typeLabel}</span>
                      <span className="text-[var(--ink-soft)]">{block.id}</span>
                    </div>
                    {block.type === "bullet" ? (
                      <div className="flex gap-3 text-sm leading-7">
                        <span className="font-semibold text-[var(--ink-soft)]">{block.marker}</span>
                        <span>{block.text}</span>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap text-sm leading-7">{block.text}</div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-sm text-[var(--ink-soft)]">No attached content blocks were produced for this node.</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-[820px] items-center justify-center rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel-muted)] text-sm text-[var(--ink-soft)]">
          Nothing selected yet.
        </div>
      )}
    </ShellSection>
  );
}

function ReviewPane({ detail, workspace, onSelect, onStatus, onNote }) {
  return (
    <div className="grid gap-5">
      <ShellSection
        eyebrow="Review"
        title="Mark quality before downstream use"
        description="Use explicit review state to record whether the extract is acceptable, questionable, or structurally wrong."
        aside={<div className="rounded-full bg-[var(--panel-strong)] px-3 py-1 text-xs font-semibold text-[var(--ink-soft)]">{workspace.stats.flaggedItems} flagged</div>}
      >
        {detail ? (
          <div className="grid gap-4">
            <div className="grid gap-2">
              {REVIEW_STATES.map((state) => (
                <button
                  key={state.value}
                  type="button"
                  onClick={() => onStatus(detail.id, state.value)}
                  className="flex items-start justify-between rounded-xl border px-4 py-3 text-left"
                  style={{
                    borderColor: detail.reviewStatus === state.value ? "var(--accent)" : "var(--line)",
                    background: detail.reviewStatus === state.value ? "var(--accent-soft)" : "var(--panel)",
                  }}
                >
                  <div>
                    <div className="text-sm font-semibold">{state.label}</div>
                    <div className="mt-1 text-xs text-[var(--ink-soft)]">
                      {state.value === "accepted"
                        ? "Structure and attachment look right."
                        : state.value === "needs-review"
                          ? "Something looks questionable."
                          : state.value === "bad-extract"
                            ? "The extract is materially wrong."
                            : "No review decision yet."}
                    </div>
                  </div>
                  <StatusPill status={state.value} />
                </button>
              ))}
            </div>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Review notes</span>
              <textarea
                value={detail.reviewNote}
                onChange={(event) => onNote(detail.id, event.target.value)}
                className="min-h-[144px] rounded-xl border border-[var(--line)] bg-[var(--panel-muted)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring)]"
                placeholder="Write what is wrong with the extract, what looks correct, or what needs a second pass."
              />
            </label>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel-muted)] px-4 py-8 text-sm text-[var(--ink-soft)]">
            Select an item to review it.
          </div>
        )}
      </ShellSection>

      <ShellSection
        eyebrow="Queue"
        title="Review queue"
        description="Everything stays inspectable. Nothing is hidden behind a chat or an opaque scoring step."
        aside={<div className="rounded-full bg-[var(--panel-strong)] px-3 py-1 text-xs font-semibold text-[var(--ink-soft)]">{workspace.reviewQueue.length} items</div>}
      >
        <div className="max-h-[360px] overflow-auto rounded-xl border border-[var(--line)] bg-[var(--panel-muted)]">
          <div className="grid grid-cols-[minmax(0,1.2fr)_120px_110px] border-b border-[var(--line)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
            <div>Item</div>
            <div>Status</div>
            <div>Type</div>
          </div>
          {workspace.reviewQueue.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className="grid w-full grid-cols-[minmax(0,1.2fr)_120px_110px] items-start gap-3 border-b border-[var(--line)] px-4 py-3 text-left text-sm last:border-b-0 hover:bg-[var(--panel)]"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{item.title}</div>
                <div className="mt-1 truncate text-xs text-[var(--ink-soft)]">{item.context}</div>
              </div>
              <div>
                <StatusPill status={item.reviewStatus} />
              </div>
              <div className="text-[var(--ink-soft)]">{item.typeLabel}</div>
            </button>
          ))}
        </div>
      </ShellSection>

      <ShellSection
        eyebrow="Next Phase"
        title="Assistant integration can come later"
        description="The app is prepared for the existing LLM service, but the assistant is not the parser and is not in the critical path here."
        aside={<Bot className="h-4 w-4 text-[var(--ink-soft)]" />}
      >
        <div className="grid gap-3">
          {[
            "Use the review state and hierarchy as the stable context layer.",
            "Add assistant explanations and repair suggestions later without changing the extraction path.",
            "Keep upload -> structure -> inspect as the primary workflow.",
          ].map((item) => (
            <div key={item} className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-muted)] px-4 py-3 text-sm">
              <MessageSquareWarning className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </ShellSection>
    </div>
  );
}

export function PwsReviewApp() {
  const [workspace, setWorkspace] = useState(emptyWorkspace());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function upload(file) {
    startTransition(async () => {
      setError("");
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/outline", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.detail || "Unable to build hierarchy");
        return;
      }
      setWorkspace(createWorkspace(payload));
    });
  }

  function choose(id) {
    setWorkspace((current) => selectNode(current, id));
  }

  function setStatus(id, status) {
    setWorkspace((current) => updateReview(current, id, { status }));
  }

  function setNote(id, note) {
    setWorkspace((current) => updateReview(current, id, { note }));
  }

  const detail = workspace.selectedId ? workspace.details[workspace.selectedId] : null;

  return (
    <div className="mx-auto max-w-[1840px] px-4 py-4">
      <div className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--shell)] shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
        <div className="border-b border-[var(--line)] bg-[linear-gradient(180deg,var(--panel)_0%,var(--panel-muted)_100%)] px-6 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--ink-soft)]">Perfect PWS</div>
              <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.04em]">PWS extraction review studio</h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--ink-soft)]">
                Upload a PWS, run the structuring pipeline, inspect the hierarchy, and record review decisions before any later mapping, grouping, or assistant layer is added.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { icon: FileUp, label: "Upload", value: workspace.filename === "No PWS loaded" ? "Idle" : "Loaded" },
                { icon: ScanText, label: "Hierarchy", value: `${workspace.stats.sections} sections` },
                { icon: PanelRightOpen, label: "Review", value: `${workspace.stats.flaggedItems} flagged` },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-[var(--accent)]" />
                      <span className="font-medium">{item.label}</span>
                      <span className="text-[var(--ink-soft)]">{item.value}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-5">
          <UploadBlock workspace={workspace} error={error} isPending={isPending} onUpload={upload} />
          <div className="grid gap-5 2xl:grid-cols-[360px_minmax(0,1fr)_380px]">
            <HierarchyPane workspace={workspace} onSelect={choose} />
            <ExtractPane detail={detail} />
            <ReviewPane detail={detail} workspace={workspace} onSelect={choose} onStatus={setStatus} onNote={setNote} />
          </div>
        </div>
      </div>
    </div>
  );
}
