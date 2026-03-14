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
import { getChildren, getRequirementById, getSectionRoots, resequenceGroup } from "@/lib/studio-graph";

const REQUIREMENT_INDENT_PX = 12;
const REQUIREMENT_MAX_INDENT_LEVELS = 4;
const GITHUB_BORDER = "#30363d";
const GITHUB_PANEL = "#161b22";
const GITHUB_PANEL_HOVER = "#1c2128";
const GITHUB_PANEL_SELECTED = "#1f2937";
const GITHUB_TEXT_MUTED = "#7d8590";
const GITHUB_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

function formatRequirementMarker(requirement) {
  const source = String(requirement.sourceRef || requirement.title || "").trim();
  return source || requirement.title;
}

function getRequirementAccent(requirement) {
  const isManualDraft =
    requirement.sourceType === "manual" || String(requirement.sourceRef || "").trim() === "New Req";

  return isManualDraft
    ? {
        text: "#F29B5C",
        dots: "rgba(242, 155, 92, 0.95)",
      }
    : {
        text: "#8FB7FF",
        dots: "rgba(143, 183, 255, 0.95)",
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

  return (
    <Box ref={setNodeRef} style={style} sx={{ mb: 0.85 }}>
      <Box
        onClick={() => onSelect(requirement.id)}
        sx={{
          position: "relative",
          px: 1.1,
          py: 0.55,
          minHeight: 0,
          cursor: "pointer",
          borderRadius: 1,
          bgcolor: selected ? GITHUB_PANEL_SELECTED : GITHUB_PANEL,
          boxShadow: "none",
          transition: "background-color 120ms ease",
          "&:hover": {
            bgcolor: selected ? GITHUB_PANEL_SELECTED : GITHUB_PANEL_HOVER,
          },
        }}
      >
        <Stack spacing={0.9}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            <Box
              {...dragHandleProps}
              onClick={(event) => event.stopPropagation()}
              sx={{
                width: 28,
                height: 28,
                flexShrink: 0,
                cursor: "grab",
                opacity: 0.9,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: GITHUB_TEXT_MUTED,
                borderRadius: 1.25,
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
                py: 0,
                display: "flex",
                alignItems: "center",
                minHeight: 0,
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
                  WebkitLineClamp: 4,
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
                <Box
                  component="span"
                  sx={{
                    fontFamily: GITHUB_FONT_STACK,
                    color: "#e6edf3",
                    fontWeight: 400,
                    letterSpacing: 0,
                  }}
                >
                  {requirement.text || requirement.summary}
                </Box>
              </Typography>
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
                ml: 0.1,
                color: hasChildren ? "#e6edf3" : "transparent",
                visibility: hasChildren ? "visible" : "hidden",
                alignSelf: "center",
                borderRadius: 1.25,
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
      {children ? <Box sx={{ mt: 0.85 }}>{children}</Box> : null}
    </Box>
  );
}

function SortableRequirementNode({
  requirement,
  allRequirements,
  selectedRequirementId,
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
      selected={selectedRequirementId === requirement.id}
      onSelect={onSelectRequirement}
      collapsed={collapsed}
      hasChildren={childRequirements.length > 0}
      onToggleCollapsed={onToggleCollapsed}
      dragHandleProps={{ ...attributes, ...listeners }}
      setNodeRef={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        marginLeft:
          Math.min(depth, REQUIREMENT_MAX_INDENT_LEVELS) * REQUIREMENT_INDENT_PX,
      }}
    >
      {childRequirements.length && !collapsed ? (
        <RequirementList
          requirements={childRequirements}
          allRequirements={allRequirements}
          selectedRequirementId={selectedRequirementId}
          onSelectRequirement={onSelectRequirement}
          onReorderRequirements={onReorderRequirements}
          collapsedIds={collapsedIds}
          onToggleCollapsed={onToggleCollapsed}
          depth={depth + 1}
        />
      ) : null}
    </RequirementCard>
  );
}

function RequirementList({
  requirements,
  allRequirements,
  selectedRequirementId,
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
              selectedRequirementId={selectedRequirementId}
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
  selectedRequirementId,
  onReorderRequirements,
  onSelectRequirement,
  collapsedIds,
  onToggleCollapsed,
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
            {section.label}
          </Typography>
        </Box>

        {sectionRoots.length ? (
          <RequirementList
            requirements={sectionRoots}
            allRequirements={allRequirements}
            selectedRequirementId={selectedRequirementId}
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
