"use client";

import { useMemo } from "react";
import ExpandLessRounded from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import {
  Alert,
  Box,
  Button,
  Divider,
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

function formatRequirementMarker(requirement) {
  const source = String(requirement.sourceRef || requirement.title || "").trim();
  return source || requirement.title;
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
  const isManualRequirement = requirement.sourceType === "manual";
  const accentColor = isManualRequirement
    ? selected
      ? "#F2B36D"
      : "#D8892F"
    : selected
      ? "#9BC0FF"
      : "#74A3FF";
  const markerColor = accentColor;

  return (
    <Box ref={setNodeRef} style={style} sx={{ mb: 0.85 }}>
      <Box
        onClick={() => onSelect(requirement.id)}
        sx={{
          position: "relative",
          pl: 1.5,
          pr: 1,
          py: 0.7,
          minHeight: 0,
          cursor: "pointer",
          bgcolor: selected ? "rgba(26, 22, 18, 0.8)" : "rgba(7, 9, 13, 0.96)",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          transition: "background-color 120ms ease",
          "&:hover": {
            bgcolor: selected ? "rgba(31, 26, 20, 0.84)" : "rgba(10, 12, 16, 0.98)",
          },
        }}
      >
        <Box
          {...dragHandleProps}
          onClick={(event) => event.stopPropagation()}
          sx={{
            position: "absolute",
            left: 0,
            top: 10,
            bottom: 10,
            width: 6,
            bgcolor: accentColor,
            opacity: selected ? 0.95 : 0.55,
            cursor: "grab",
            borderRadius: 999,
          }}
        />
        <Stack direction="row" spacing={1.15} alignItems="center">
          <Box sx={{ flexGrow: 1, minWidth: 0, pr: 0.15, py: 0.2, pl: 0.05 }}>
            <Typography
              variant="body2"
              color="text.primary"
              sx={{
                fontSize: "0.89rem",
                lineHeight: 1.28,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              <Box
                component="span"
                sx={{
                  color: markerColor,
                  fontSize: "0.89rem",
                  fontWeight: 700,
                  letterSpacing: 0.12,
                  mr: 0.9,
                  verticalAlign: "baseline",
                  textTransform: "uppercase",
                }}
              >
                {formatRequirementMarker(requirement)}
              </Box>
              {requirement.text || requirement.summary}
            </Typography>
          </Box>
          <Button
            size="small"
            onClick={(event) => {
              event.stopPropagation();
              onToggleCollapsed?.(requirement.id);
            }}
            sx={{
              minWidth: 28,
              px: 0.25,
              mt: 0,
              ml: 0.1,
              color: hasChildren ? "text.secondary" : "transparent",
              visibility: hasChildren ? "visible" : "hidden",
              alignSelf: "center",
            }}
          >
            {collapsed ? (
              <ExpandMoreRounded fontSize="small" />
            ) : (
              <ExpandLessRounded fontSize="small" />
            )}
          </Button>
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
        p: 2.75,
        borderRadius: 0.5,
        bgcolor: "transparent",
        borderColor: "transparent",
        boxShadow: "none",
      }}
    >
      <Stack spacing={1.5}>
          <Box>
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
