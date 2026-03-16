"use client";

import { useMemo } from "react";
import ExpandLessRounded from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
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
import { RichTextContent } from "@/components/rich-text-content";
import { hasTableBlock, parseRichTextBlocks } from "@/lib/rich-text-blocks";
import { getChildren, getRequirementById, getSectionRoots, resequenceGroup } from "@/lib/studio-graph";

const REQUIREMENT_INDENT_STEP = "28.125px";
const REQUIREMENT_MAX_INDENT_LEVELS = 4;
const REQUIREMENT_ROW_GAP = 1.3;
const REQUIREMENT_CHILD_BLOCK_GAP = 1.25;
const GITHUB_BORDER = "var(--studio-border)";
const GITHUB_PANEL = "var(--studio-panel)";
const GITHUB_PANEL_HOVER = "var(--studio-panel-hover)";
const GITHUB_PANEL_SELECTED = "var(--studio-panel-selected)";
const GITHUB_TEXT_MUTED = "var(--studio-text-muted)";
const GITHUB_FONT_STACK =
  "Tahoma, Verdana, Geneva, sans-serif";
const LIGHT_SHARED_SURFACE = "#edf1f5";
const LIGHT_SHARED_SURFACE_HOVER = "#e4eaf0";
const LIGHT_SHARED_SURFACE_SELECTED = "#d5e2ef";

function formatRequirementMarker(requirement) {
  const source = String(requirement.sourceRef || requirement.title || "").trim();
  return (source || requirement.title || "").toUpperCase();
}

function formatRequirementMarkerDisplay(requirement) {
  return formatRequirementMarker(requirement).replaceAll(".", ".\u200b");
}

function getRequirementAccent(requirement) {
  if (requirement.accentColor === "#3fb950") {
    return {
      text: "#3fb950",
      dots: "rgba(63, 185, 80, 0.95)",
      softBg: "#e7f6ec",
      selectedBg: "#d6efdf",
    };
  }

  if (requirement.accentColor === "#c678dd") {
    return {
      text: "#c678dd",
      dots: "rgba(198, 120, 221, 0.95)",
      softBg: "#f3e7f9",
      selectedBg: "#ead8f4",
    };
  }

  if (requirement.accentColor === "#d97706" || requirement.accentColor === "#f59e0b") {
    return {
      text: "#d97706",
      dots: "rgba(217, 119, 6, 0.95)",
      softBg: "#fff1df",
      selectedBg: "#fde3c2",
    };
  }

  return {
    text: "#5f8dff",
    dots: "rgba(95, 141, 255, 0.95)",
    softBg: "#e8f0ff",
    selectedBg: "#dbe7ff",
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
  depth = 0,
  children,
}) {
  const accent = getRequirementAccent(requirement);
  const theme = useTheme();
  const isLightMode = theme.palette.mode === "light";
  const richBlocks =
    requirement.structuredContent || parseRichTextBlocks(requirement.text || requirement.summary || "");
  const containsTable = hasTableBlock(richBlocks);
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
  const markerFontSize = depth <= 0 ? "0.86rem" : depth === 1 ? "0.8rem" : depth === 2 ? "0.74rem" : "0.68rem";

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
          pl: 0,
          pr: 0,
          py: 0,
          minHeight: 54,
          cursor: "pointer",
          borderRadius: 0.65,
          bgcolor: selected ? accent.selectedBg : "rgba(255,255,255,0.96)",
          overflow: "hidden",
          boxShadow: selected
            ? "0 0 0 1px rgba(59, 130, 246, 0.24), 0 1px 5px rgba(15, 23, 42, 0.12), 0 1px 2px rgba(15, 23, 42, 0.08)"
            : "0 1px 5px rgba(15, 23, 42, 0.11), 0 1px 2px rgba(15, 23, 42, 0.07)",
          transition: "background-color 120ms ease, box-shadow 120ms ease",
          "&:hover": {
            bgcolor: selected ? accent.selectedBg : "rgba(255,255,255,0.98)",
            boxShadow: selected
              ? "0 0 0 1px rgba(59, 130, 246, 0.32), 0 2px 6px rgba(15, 23, 42, 0.14), 0 1px 3px rgba(15, 23, 42, 0.09)"
              : "0 2px 6px rgba(15, 23, 42, 0.12), 0 1px 3px rgba(15, 23, 42, 0.08)",
          },
        }}
      >
        <Stack spacing={0}>
          <Stack direction="row" spacing={0} alignItems="stretch">
            <Box
              {...dragHandleProps}
              onClick={(event) => event.stopPropagation()}
              sx={{
                width: 8,
                minHeight: 54,
                flexShrink: 0,
                cursor: "grab",
                opacity: 0.9,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#f3f4f6",
                bgcolor: "#6f7d8d",
                alignSelf: "stretch",
              }}
            >
              <Box sx={{ fontSize: 15, lineHeight: 1 }}>⋮</Box>
            </Box>
            <Box
              sx={{
                flexGrow: 1,
                minWidth: 0,
                pr: 0,
                py: 0,
                pl: 0,
                display: "flex",
                alignItems: "stretch",
                minHeight: containsTable ? 0 : 54,
              }}
            >
              <Box
                sx={{
                  width: "100%",
                  minWidth: 0,
                  display: "grid",
                  gridTemplateColumns: "84px 2px minmax(0, 1fr)",
                  alignItems: "stretch",
                }}
              >
                <Box
                  sx={{
                    fontFamily: GITHUB_FONT_STACK,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pl: 0.2,
                    pr: 0.2,
                    py: 0,
                    minHeight: containsTable ? 54 : "100%",
                    minWidth: 0,
                    boxSizing: "border-box",
                    bgcolor: accent.softBg,
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      fontFamily: GITHUB_FONT_STACK,
                      color: "#4b5563",
                      fontSize: markerFontSize,
                      fontWeight: 400,
                      letterSpacing: 0,
                      lineHeight: 1.15,
                      textTransform: "none",
                      display: "block",
                      width: "50px",
                      maxWidth: "50px",
                      textAlign: "center",
                      whiteSpace: "normal",
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                      overflow: "hidden",
                      boxSizing: "border-box",
                    }}
                  >
                    {formatRequirementMarkerDisplay(requirement)}
                  </Box>
                </Box>
                <Box
                  sx={{
                    width: "100%",
                    bgcolor: "#b8c0ca",
                  }}
                />
                <Box
                  sx={{
                    fontFamily: GITHUB_FONT_STACK,
                    minWidth: 0,
                    display: "flex",
                    alignItems: containsTable ? "stretch" : "center",
                    pl: 0.95,
                    pr: 0.55,
                    bgcolor: "transparent",
                  }}
                >
                  {containsTable ? (
                    <Box sx={{ minWidth: 0, width: "100%", py: 0.45 }}>
                      <RichTextContent
                        content={trailingTableContent}
                        dense
                        tablePreviewRows={3}
                        showTableOverflowNote
                      />
                    </Box>
                  ) : (
                    <Box
                      component="div"
                      sx={{
                        fontFamily: GITHUB_FONT_STACK,
                        color: "inherit",
                        fontSize: "0.84rem",
                        lineHeight: 1.28,
                        fontWeight: 400,
                        letterSpacing: 0,
                        textTransform: "none",
                        WebkitFontSmoothing: "antialiased",
                        MozOsxFontSmoothing: "grayscale",
                        color: "#111827",
                        minWidth: 0,
                        maxHeight: "3.84em",
                        overflow: "hidden",
                      }}
                    >
                      {requirement.text || requirement.summary}
                    </Box>
                  )}
                </Box>
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
                alignSelf: "stretch",
                display: "flex",
                alignItems: "center",
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
      depth={depth}
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
