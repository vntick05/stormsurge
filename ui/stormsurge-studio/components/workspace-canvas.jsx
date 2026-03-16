"use client";

import { useMemo } from "react";
import ExpandLessRounded from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import MoreVertRounded from "@mui/icons-material/MoreVertRounded";
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { RichTextContent, hasTableBlock, parseRichTextBlocks } from "@/components/rich-text-content";
import { getChildren, getRequirementById, getSectionRoots, resequenceGroup } from "@/lib/studio-graph";

const REQUIREMENT_INDENT_STEP = "18px";
const REQUIREMENT_MAX_INDENT_LEVELS = 4;
const REQUIREMENT_ROW_GAP = 1.3;
const REQUIREMENT_CHILD_BLOCK_GAP = 1.25;
const GITHUB_BORDER = "var(--studio-border)";
const GITHUB_PANEL = "var(--studio-panel)";
const GITHUB_PANEL_HOVER = "var(--studio-panel-hover)";
const GITHUB_PANEL_SELECTED = "var(--studio-panel-selected)";
const GITHUB_TEXT_MUTED = "var(--studio-text-muted)";
const GITHUB_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
const LIGHT_SHARED_SURFACE = "#edf1f5";
const LIGHT_SHARED_SURFACE_HOVER = "#e4eaf0";
const LIGHT_SHARED_SURFACE_SELECTED = "#d5e2ef";

function formatRequirementMarker(requirement) {
  const source = String(requirement.sourceRef || requirement.title || "").trim();
  return (source || requirement.title || "").toUpperCase();
}

function getRequirementAccent(requirement) {
  if (requirement.accentColor === "#3fb950") {
    return {
      text: "#3fb950",
      dots: "rgba(63, 185, 80, 0.95)",
    };
  }

  if (requirement.accentColor === "#c678dd") {
    return {
      text: "#c678dd",
      dots: "rgba(198, 120, 221, 0.95)",
    };
  }

  return {
    text: "#5f8dff",
    dots: "rgba(95, 141, 255, 0.95)",
  };
}

function RequirementCard({
  requirement,
  selected,
  onSelect,
  collapsed,
  hasChildren,
  onToggleCollapsed,
  dragHandleProps,
  setNodeRef,
  style,
  children,
}) {
  const accent = getRequirementAccent(requirement);
  const theme = useTheme();
  const isLightMode = theme.palette.mode === "light";
  const richBlocks = parseRichTextBlocks(requirement.text || requirement.summary || "");
  const containsTable = hasTableBlock(requirement.text || requirement.summary || "");
  const firstNarrativeBlock = richBlocks.find(
    (block) => block.type === "paragraph" || block.type === "heading",
  );
  const leadingNarrativeText =
    firstNarrativeBlock?.type === "paragraph"
      ? firstNarrativeBlock.text
      : firstNarrativeBlock?.type === "heading"
        ? firstNarrativeBlock.text
        : "";
  const trailingTableContent = containsTable
    ? richBlocks
        .filter((block) => block.type === "table")
        .map((block) => {
          const header = `| ${block.header.join(" | ")} |`;
          const separator = `| ${block.header.map(() => "---").join(" | ")} |`;
          const rows = block.rows.map((row) => `| ${row.join(" | ")} |`);
          return [header, separator, ...rows].join("\n");
        })
        .join("\n\n")
    : "";
  const requirementSurface = isLightMode ? LIGHT_SHARED_SURFACE : GITHUB_PANEL;
  const requirementSurfaceHover = isLightMode ? LIGHT_SHARED_SURFACE_HOVER : GITHUB_PANEL_HOVER;
  const requirementSurfaceSelected = isLightMode
    ? LIGHT_SHARED_SURFACE_SELECTED
    : GITHUB_PANEL_SELECTED;

  return (
    <Box ref={setNodeRef} style={style} sx={{ mb: REQUIREMENT_ROW_GAP }}>
      <Box
        onClick={(event) =>
          onSelect(requirement.id, {
            multiSelectKey: event.ctrlKey || event.metaKey,
          })
        }
        sx={{
          position: "relative",
          pl: 0.55,
          pr: 0.8,
          py: 0.72,
          minHeight: 44,
          cursor: "pointer",
          borderRadius: 0.65,
          bgcolor: selected ? requirementSurfaceSelected : requirementSurface,
          boxShadow: selected
            ? "0 0 0 1px rgba(88, 166, 255, 0.18), 0 8px 16px rgba(21, 31, 41, 0.12)"
            : "0 1px 0 rgba(17, 24, 39, 0.05), 0 3px 8px rgba(17, 24, 39, 0.08)",
          transition: "background-color 120ms ease, box-shadow 120ms ease",
          "&:hover": {
            bgcolor: selected ? requirementSurfaceSelected : requirementSurfaceHover,
            boxShadow: selected
              ? "0 0 0 1px rgba(88, 166, 255, 0.22), 0 10px 18px rgba(21, 31, 41, 0.14)"
              : "0 1px 0 rgba(17, 24, 39, 0.06), 0 5px 12px rgba(17, 24, 39, 0.1)",
          },
        }}
      >
        <Stack spacing={0.9}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            <Box
              {...dragHandleProps}
              onClick={(event) => event.stopPropagation()}
              sx={{
                width: 24,
                height: 24,
                flexShrink: 0,
                cursor: "grab",
                opacity: 0.9,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: GITHUB_TEXT_MUTED,
                borderRadius: 0.9,
                bgcolor: "transparent",
              }}
            >
              <MoreVertRounded sx={{ fontSize: 15 }} />
            </Box>
            <Box
              sx={{
                flexGrow: 1,
                minWidth: 0,
                pr: 0.15,
                py: 0.1,
                display: "flex",
                alignItems: containsTable ? "flex-start" : "center",
                minHeight: containsTable ? 0 : 28,
              }}
            >
              <Box
                sx={{
                  width: "100%",
                }}
              >
                <Typography
                  variant="body2"
                  color="text.primary"
                  sx={{
                    fontFamily: GITHUB_FONT_STACK,
                    fontSize: "0.875rem",
                    lineHeight: 1.45,
                    fontWeight: 400,
                    width: "100%",
                    display: "-webkit-box",
                    WebkitLineClamp: containsTable ? 3 : 4,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      fontFamily: GITHUB_FONT_STACK,
                      color: accent.text,
                      fontWeight: 600,
                      letterSpacing: 0,
                      mr: 0.45,
                    }}
                  >
                    {formatRequirementMarker(requirement)}
                  </Box>
                  <Box component="span" sx={{ color: "#111827", fontWeight: 400, letterSpacing: 0 }}>
                    {containsTable
                      ? leadingNarrativeText || requirement.text || requirement.summary
                      : requirement.text || requirement.summary}
                  </Box>
                </Typography>
                {containsTable && trailingTableContent ? (
                  <Box sx={{ mt: 0.55 }}>
                    <RichTextContent
                      content={trailingTableContent}
                      dense
                      tablePreviewRows={3}
                      showTableOverflowNote
                    />
                  </Box>
                ) : null}
              </Box>
            </Box>
            <Button
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                onToggleCollapsed?.(requirement.id);
              }}
              sx={{
                minWidth: 32,
                px: 0.4,
                mt: 0,
                ml: 0,
                color: hasChildren ? "var(--studio-text)" : "transparent",
                visibility: hasChildren ? "visible" : "hidden",
                alignSelf: "center",
                borderRadius: 0.9,
                bgcolor: "transparent",
              }}
            >
              {collapsed ? (
                <ExpandMoreRounded fontSize="small" />
              ) : (
                <ExpandLessRounded fontSize="small" />
              )}
            </Button>
          </Stack>
        </Stack>
      </Box>
      {children ? <Box sx={{ mt: REQUIREMENT_CHILD_BLOCK_GAP }}>{children}</Box> : null}
    </Box>
  );
}

function SortableRequirementNode({
  requirement,
  allRequirements,
  selectedRequirementIds,
  onSelectRequirement,
  onReorderRequirements,
  collapsedIds,
  onToggleCollapsed,
  depth = 0,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: requirement.id });
  const childRequirements = getChildren(allRequirements, requirement.id);
  const collapsed = collapsedIds.has(requirement.id);

  return (
    <RequirementCard
      requirement={requirement}
      selected={selectedRequirementIds.has(requirement.id)}
      onSelect={onSelectRequirement}
      collapsed={collapsed}
      hasChildren={childRequirements.length > 0}
      onToggleCollapsed={onToggleCollapsed}
      dragHandleProps={{ ...attributes, ...listeners }}
      setNodeRef={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {childRequirements.length && !collapsed ? (
        <Box sx={{ ml: REQUIREMENT_INDENT_STEP }}>
          <RequirementList
            requirements={childRequirements}
            allRequirements={allRequirements}
            selectedRequirementIds={selectedRequirementIds}
            onSelectRequirement={onSelectRequirement}
            onReorderRequirements={onReorderRequirements}
            collapsedIds={collapsedIds}
            onToggleCollapsed={onToggleCollapsed}
            depth={depth + 1}
          />
        </Box>
      ) : null}
    </RequirementCard>
  );
}

function RequirementList({
  requirements,
  allRequirements,
  selectedRequirementIds,
  onSelectRequirement,
  onReorderRequirements,
  collapsedIds,
  onToggleCollapsed,
  depth = 0,
}) {
  const requirementIds = requirements.map((requirement) => requirement.id);

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!active?.id || !over?.id || active.id === over.id) {
      return;
    }

    const activeRequirement = getRequirementById(allRequirements, String(active.id));
    const overRequirement = getRequirementById(allRequirements, String(over.id));

    if (!activeRequirement || !overRequirement) {
      return;
    }

    if (activeRequirement.parentId !== overRequirement.parentId) {
      return;
    }

    const oldIndex = requirements.findIndex((item) => item.id === active.id);
    const newIndex = requirements.findIndex((item) => item.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const reorderedGroup = arrayMove(requirements, oldIndex, newIndex).map(
      (item, index) => ({
        ...item,
        position: index + 1,
      }),
    );
    onReorderRequirements(resequenceGroup(allRequirements, reorderedGroup));
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={requirementIds} strategy={verticalListSortingStrategy}>
        <Box
          sx={{
            mt: 0,
            p: 0,
            borderRadius: 0,
            bgcolor: "transparent",
          }}
        >
          {requirements.map((requirement) => (
            <SortableRequirementNode
              key={requirement.id}
              requirement={requirement}
              allRequirements={allRequirements}
              selectedRequirementIds={selectedRequirementIds}
              onSelectRequirement={onSelectRequirement}
              onReorderRequirements={onReorderRequirements}
              collapsedIds={collapsedIds}
              onToggleCollapsed={onToggleCollapsed}
              depth={depth}
            />
          ))}
        </Box>
      </SortableContext>
    </DndContext>
  );
}

export function WorkspaceCanvas({
  section,
  allRequirements,
  selectedRequirementIds,
  onReorderRequirements,
  onSelectRequirement,
  collapsedIds,
  onToggleCollapsed,
  titleColorOverride = "",
}) {
  const sectionRoots = useMemo(
    () => (section ? getSectionRoots(allRequirements, section.id) : []),
    [allRequirements, section],
  );

  if (!section) {
    return null;
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.25,
        borderRadius: 0,
        bgcolor: "transparent",
        borderColor: "transparent",
        boxShadow: "none",
      }}
    >
      <Stack spacing={1.5}>
        <Box
          sx={{
            pb: 1.1,
            borderBottom: 0,
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            <Box component="span" sx={{ color: titleColorOverride || "inherit" }}>
              {section.label}
            </Box>
          </Typography>
        </Box>

        {sectionRoots.length ? (
          <RequirementList
            requirements={sectionRoots}
            allRequirements={allRequirements}
            selectedRequirementIds={selectedRequirementIds}
            onSelectRequirement={onSelectRequirement}
            onReorderRequirements={onReorderRequirements}
            collapsedIds={collapsedIds}
            onToggleCollapsed={onToggleCollapsed}
          />
        ) : (
          <Alert severity="info">
            {section.id === "unassigned"
              ? "No unassigned requirements are waiting for triage."
              : "This section does not have any extracted or manual nodes yet."}
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
