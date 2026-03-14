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
  return (
    <Box ref={setNodeRef} style={style} sx={{ mb: 1 }}>
      <Paper
        variant="outlined"
        onClick={() => onSelect(requirement.id)}
        sx={{
          position: "relative",
          overflow: "hidden",
          pl: 1.75,
          pr: 1.25,
          py: 1.25,
          borderRadius: 1,
          cursor: "pointer",
          borderColor: selected ? "primary.main" : "divider",
          bgcolor: selected ? "rgba(108,182,255,0.16)" : "rgba(8, 15, 28, 0.88)",
          transition: "border-color 120ms ease, background-color 120ms ease",
        }}
      >
        <Box
          {...dragHandleProps}
          onClick={(event) => event.stopPropagation()}
          sx={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 8,
            bgcolor: selected ? "primary.light" : "primary.main",
            opacity: selected ? 0.95 : 0.8,
            cursor: "grab",
          }}
        />
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <Box
            sx={{
              width: 52,
              minWidth: 52,
              alignSelf: "stretch",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRight: 1,
              borderColor: "divider",
              pl: 0.25,
              pr: 0.5,
            }}
          >
            <Typography
              variant="caption"
              color="primary.main"
              sx={{
                fontWeight: 700,
                letterSpacing: 0.2,
                textAlign: "center",
                lineHeight: 1.2,
                wordBreak: "break-word",
              }}
            >
              {formatRequirementMarker(requirement)}
            </Typography>
          </Box>
          <Box sx={{ flexGrow: 1, minWidth: 0, pr: 0.25 }}>
            <Typography
              variant="body2"
              color="text.primary"
              sx={{
                lineHeight: 1.4,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
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
              ml: 0.25,
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
      </Paper>
      {children}
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
        <Box sx={{ mt: depth === 0 ? 0 : 0.5 }}>
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
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
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
