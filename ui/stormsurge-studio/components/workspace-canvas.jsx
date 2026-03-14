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
          pr: 1,
          pl: 0.55,
          py: 0.6,
          minHeight: 48,
          cursor: "pointer",
          borderRadius: 2.4,
          bgcolor: selected ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.09)",
          boxShadow: "none",
          transition: "background-color 120ms ease",
          "&:hover": {
            bgcolor: selected ? "rgba(255, 255, 255, 0.16)" : "rgba(255, 255, 255, 0.12)",
          },
        }}
      >
        <Stack direction="row" spacing={1.2} alignItems="center">
          <Box
            {...dragHandleProps}
            onClick={(event) => event.stopPropagation()}
            sx={{
              width: 14,
              height: 22,
              flexShrink: 0,
              cursor: "grab",
              opacity: 0.52,
              ml: 0.25,
              mr: 0.35,
              position: "relative",
              "&::before": {
                content: '""',
                position: "absolute",
                left: 2,
                top: 5,
                width: 3,
                height: 3,
                borderRadius: 999,
                bgcolor: accent.dots,
                boxShadow:
                  `0 7px 0 ${accent.dots}, 6px 0 0 ${accent.dots}, 6px 7px 0 ${accent.dots}`,
              },
            }}
          />
          <Box
            sx={{
              flexGrow: 1,
              minWidth: 0,
              pr: 0.15,
              py: 0.02,
              display: "flex",
              alignItems: "center",
              minHeight: 36,
            }}
          >
            <Typography
              variant="body2"
              color="text.primary"
              sx={{
                fontSize: "0.89rem",
                lineHeight: 1.28,
                width: "100%",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              <Box
                component="span"
                sx={{
                  color: accent.text,
                  fontSize: "0.84rem",
                  fontWeight: 600,
                  letterSpacing: 0.08,
                  mr: 0.7,
                  verticalAlign: "baseline",
                  textTransform: "uppercase",
                }}
              >
                {formatRequirementMarker(requirement)}
              </Box>
              <Box
                component="span"
                sx={{
                  color: "#FFFFFF",
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
              minWidth: 28,
              px: 0.25,
              mt: 0,
              ml: 0.1,
              color: hasChildren ? "#FFFFFF" : "transparent",
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
        p: 2.25,
        borderRadius: 0,
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
