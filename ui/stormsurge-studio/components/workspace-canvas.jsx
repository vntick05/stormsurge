"use client";

import { useMemo } from "react";
import DragIndicatorRounded from "@mui/icons-material/DragIndicatorRounded";
import PlaylistAddRounded from "@mui/icons-material/PlaylistAddRounded";
import {
  Alert,
  Box,
  Button,
  Chip,
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

function RequirementCard({
  requirement,
  selected,
  onSelect,
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
          p: 1.25,
          borderRadius: 2.5,
          cursor: "pointer",
          borderColor: selected ? "primary.main" : "divider",
          bgcolor: selected ? "rgba(11,92,173,0.05)" : "background.paper",
          transition: "border-color 120ms ease, background-color 120ms ease",
        }}
      >
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <Button
            {...dragHandleProps}
            size="small"
            sx={{ minWidth: 34, px: 0.5, mt: 0, color: "text.secondary" }}
          >
            <DragIndicatorRounded fontSize="small" />
          </Button>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
              <Chip size="small" label={requirement.title} color="primary" variant="outlined" />
              <Chip
                size="small"
                label={requirement.sourceType}
                color={requirement.sourceType === "manual" ? "secondary" : "default"}
                variant="outlined"
              />
              {requirement.kind !== "paragraph" ? (
                <Chip size="small" label={requirement.kind} variant="outlined" />
              ) : null}
            </Stack>
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

  return (
    <RequirementCard
      requirement={requirement}
      selected={selectedRequirementId === requirement.id}
      onSelect={onSelectRequirement}
      dragHandleProps={{ ...attributes, ...listeners }}
      setNodeRef={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        marginLeft: depth * 24,
      }}
    >
      {childRequirements.length ? (
        <RequirementList
          requirements={childRequirements}
          allRequirements={allRequirements}
          selectedRequirementId={selectedRequirementId}
          onSelectRequirement={onSelectRequirement}
          onReorderRequirements={onReorderRequirements}
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
        <Box sx={{ mt: depth === 0 ? 0 : 0.75 }}>
          {requirements.map((requirement) => (
            <SortableRequirementNode
              key={requirement.id}
              requirement={requirement}
              allRequirements={allRequirements}
              selectedRequirementId={selectedRequirementId}
              onSelectRequirement={onSelectRequirement}
              onReorderRequirements={onReorderRequirements}
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
  requirements,
  allRequirements,
  unassignedRequirements,
  selectedRequirementId,
  onCreateRequirement,
  onReorderRequirements,
  onSelectRequirement,
}) {
  const sectionRoots = useMemo(
    () => (section ? getSectionRoots(allRequirements, section.id) : []),
    [allRequirements, section],
  );

  if (!section) {
    return null;
  }

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems="flex-start">
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="overline" color="text.secondary">
              Active Tab
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
              {section.label}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {section.description}
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<PlaylistAddRounded />}
            onClick={onCreateRequirement}
          >
            Add top-level requirement
          </Button>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Hierarchy
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Drag within the tree
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 640 }}>
              Drag handles reorder sibling nodes. Promote and demote from the inspector
              to reshape parent-child relationships.
            </Typography>
          </Box>

          {sectionRoots.length ? (
            <RequirementList
              requirements={sectionRoots}
              allRequirements={allRequirements}
              selectedRequirementId={selectedRequirementId}
              onSelectRequirement={onSelectRequirement}
              onReorderRequirements={onReorderRequirements}
            />
          ) : (
            <Alert severity="info">
              This section does not have any extracted or manual nodes yet.
            </Alert>
          )}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Holding Area
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Unassigned requirements
            </Typography>
          </Box>
          {!unassignedRequirements.length ? (
            <Typography variant="body2" color="text.secondary">
              No unassigned requirements are waiting for triage.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              {unassignedRequirements.map((requirement) => (
                <Paper
                  key={requirement.id}
                  variant="outlined"
                  onClick={() => onSelectRequirement(requirement.id)}
                  sx={{
                    p: 1.5,
                    borderRadius: 2.5,
                    cursor: "pointer",
                    borderColor:
                      selectedRequirementId === requirement.id ? "primary.main" : "divider",
                  }}
                >
                  <Typography variant="caption" color="primary.main" sx={{ fontWeight: 700 }}>
                    {requirement.title}
                  </Typography>
                  <Typography variant="body2" color="text.primary" sx={{ mt: 0.5, lineHeight: 1.4 }}>
                    {requirement.text || requirement.summary}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
