"use client";

import { useEffect, useMemo, useState } from "react";
import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import CloudUploadRounded from "@mui/icons-material/CloudUploadRounded";
import DragIndicatorRounded from "@mui/icons-material/DragIndicatorRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import HubRounded from "@mui/icons-material/HubRounded";
import InsightsRounded from "@mui/icons-material/InsightsRounded";
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
import {
  Alert,
  AppBar,
  Box,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import { DetailInspector } from "@/components/detail-inspector";
import { UploadWorkspaceCard } from "@/components/upload-workspace-card";
import { WorkspaceCanvas } from "@/components/workspace-canvas";
import {
  createChildRequirement,
  createTopLevelRequirement,
  demoteRequirement,
  getRequirementById,
  getSectionRoots,
  moveRequirement,
  promoteRequirement,
  reassignRequirement,
} from "@/lib/studio-graph";
import { transformOutlineToWorkspace } from "@/lib/studio-transform";

const LEFT_RAIL_DEFAULT_WIDTH = 360;
const RIGHT_RAIL_DEFAULT_WIDTH = 320;
const RAIL_COLLAPSED_WIDTH = 72;
const RAIL_MIN_WIDTH = 240;
const RAIL_MAX_WIDTH = 520;
const BOTTOM_DOCK_DEFAULT_HEIGHT = 340;
const BOTTOM_DOCK_MIN_HEIGHT = 220;
const BOTTOM_DOCK_MAX_HEIGHT = 520;
const STUDIO_STATE_STORAGE_KEY = "stormsurge-studio-state-v1";
const STORM_WORKSPACE_TABS = [
  "MTS Definition",
  "MTS Solution",
  "Exceeds the Standard",
  "Risks",
];
const UNASSIGNED_SECTION = {
  id: "unassigned",
  label: "Unassigned Requirements",
  shortLabel: "UNAS",
  sourceKind: "system",
  sectionNumber: null,
};
const subtleScrollbarSx = {
  scrollbarWidth: "thin",
  scrollbarColor: "rgba(96, 109, 128, 0.22) transparent",
  "&::-webkit-scrollbar": {
    width: 8,
    height: 8,
  },
  "&::-webkit-scrollbar-track": {
    background: "transparent",
  },
  "&::-webkit-scrollbar-thumb": {
    backgroundColor: "rgba(96, 109, 128, 0.18)",
    borderRadius: 999,
    border: "2px solid transparent",
    backgroundClip: "padding-box",
  },
  "&:hover::-webkit-scrollbar-thumb": {
    backgroundColor: "rgba(96, 109, 128, 0.28)",
  },
};

function clampRailWidth(width) {
  return Math.min(Math.max(width, RAIL_MIN_WIDTH), RAIL_MAX_WIDTH);
}

function clampDockHeight(height) {
  return Math.min(Math.max(height, BOTTOM_DOCK_MIN_HEIGHT), BOTTOM_DOCK_MAX_HEIGHT);
}

function buildSectionShortLabel(label, fallback = "CUST") {
  const shortLabel = label
    .split(/\s+/)
    .map((token) => token[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();

  return shortLabel || fallback;
}

function buildCustomSection(label, sectionCount) {
  const trimmedLabel = label.trim() || `Custom Section ${sectionCount + 1}`;

  return {
    id: `custom-${Date.now()}`,
    label: trimmedLabel,
    shortLabel: buildSectionShortLabel(trimmedLabel),
    prompt: "Use this lane for custom grouped requirements and solution framing.",
    description:
      "Custom sections let you reorganize extracted material outside the original PWS shape.",
    sourceKind: "manual",
    sectionNumber: null,
  };
}

function SortableSectionTab({ section, selected, onSelect, onRename }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: section.id,
  });

  return (
    <ListItemButton
      ref={setNodeRef}
      selected={selected}
      onClick={() => onSelect(section.id)}
      onDoubleClick={() => onRename(section.id)}
      sx={{
        borderRadius: 1,
        mb: 0.5,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <Box
        {...attributes}
        {...listeners}
        onClick={(event) => event.stopPropagation()}
        sx={{
          width: 6,
          alignSelf: "stretch",
          mr: 1,
          ml: -0.5,
          borderRadius: 0.5,
          bgcolor: selected ? "primary.light" : "primary.main",
          opacity: selected ? 0.95 : 0.7,
          cursor: "grab",
          flexShrink: 0,
        }}
      />
      <ListItemText primary={section.label} />
      <Tooltip title="Rename section tab">
        <IconButton
          size="small"
          edge="end"
          onClick={(event) => {
            event.stopPropagation();
            onRename(section.id);
          }}
          sx={{ ml: 0.5 }}
        >
          <EditRounded fontSize="small" />
        </IconButton>
      </Tooltip>
    </ListItemButton>
  );
}

function RailShell({
  side,
  title,
  subtitle,
  width,
  collapsed,
  onToggleCollapsed,
  onResizeStart,
  children,
}) {
  const isLeft = side === "left";

  return (
    <Box
      sx={{
        width: { xs: "100%", xl: width },
        flexShrink: 0,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        borderRight: { xs: 0, xl: isLeft ? 1 : 0 },
        borderLeft: { xs: 0, xl: isLeft ? 0 : 1 },
        borderBottom: { xs: 1, xl: 0 },
        borderColor: "divider",
        bgcolor: "background.paper",
        backgroundImage: (theme) =>
          `linear-gradient(180deg, ${theme.palette.background.paper}, rgba(15,23,42,0.96))`,
        transition: "width 180ms ease",
        overflow: "hidden",
        overscrollBehavior: "contain",
      }}
    >
      <Toolbar sx={{ minHeight: 80 }} />
      <Box
        sx={{
          px: 1.5,
          py: 1,
          display: "flex",
          justifyContent: collapsed ? "center" : "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        {collapsed ? null : (
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary">
              {subtitle}
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
          </Box>
        )}
        <Tooltip title={collapsed ? `Expand ${title}` : `Collapse ${title}`}>
          <IconButton onClick={onToggleCollapsed} size="small">
            {isLeft ? (
              collapsed ? <ChevronRightRounded /> : <ChevronLeftRounded />
            ) : collapsed ? (
              <ChevronLeftRounded />
            ) : (
              <ChevronRightRounded />
            )}
          </IconButton>
        </Tooltip>
      </Box>

      {collapsed ? (
        <Box
          sx={{
            px: 1,
            py: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflowY: "auto",
            minHeight: 0,
            ...subtleScrollbarSx,
            overscrollBehavior: "contain",
          }}
        >
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: 2 }}
          >
            {title}
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            p: 2,
            pt: 1,
            display: "grid",
            gap: 2,
            overflowY: "auto",
            minHeight: 0,
            flex: "1 1 auto",
            ...subtleScrollbarSx,
          }}
        >
          {children}
        </Box>
      )}

      <Box
        onMouseDown={onResizeStart}
        sx={{
          position: "absolute",
          top: 80,
          bottom: 0,
          [isLeft ? "right" : "left"]: -5,
          width: 10,
          cursor: "col-resize",
          zIndex: 10,
          display: { xs: "none", xl: "flex" },
          alignItems: "center",
          justifyContent: "center",
          "&::before": {
            content: '""',
            width: 4,
            height: 56,
            borderRadius: 999,
            bgcolor: "rgba(148, 163, 184, 0.18)",
          },
          "&:hover::before": {
            bgcolor: "rgba(148, 163, 184, 0.34)",
          },
        }}
      >
        <DragIndicatorRounded
          sx={{
            position: "absolute",
            color: "rgba(203, 213, 225, 0.54)",
            fontSize: 18,
            transform: "rotate(90deg)",
          }}
        />
      </Box>
    </Box>
  );
}

function buildEmptyWorkspace() {
  return {
    sections: [],
    requirements: [],
    sourceFilename: null,
    sourceFormat: null,
  };
}

function buildEmptyStormWorkspace() {
  return STORM_WORKSPACE_TABS.reduce((accumulator, label) => {
    accumulator[label] = "";
    return accumulator;
  }, {});
}

function StormWorkspaceBar({ activeTab, onTabChange, notesByTab, onNotesChange }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: { xs: 1, xl: 0 },
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        height: "100%",
        bgcolor: "#0b1220",
        backgroundImage: "none",
        boxShadow: { xs: "0 22px 44px rgba(2, 6, 23, 0.46)", xl: "none" },
        borderTop: 1,
        borderLeft: { xs: 1, xl: 0 },
        borderRight: { xs: 1, xl: 0 },
        borderBottom: 0,
        borderColor: "divider",
      }}
    >
      <Box
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          px: 1,
          background:
            "linear-gradient(180deg, #172033 0%, #101827 100%)",
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, value) => onTabChange(value)}
          variant="scrollable"
          scrollButtons="auto"
          textColor="primary"
          indicatorColor="primary"
          sx={{
            minHeight: 54,
            "& .MuiTab-root": {
              minHeight: 54,
              alignItems: "flex-start",
              textTransform: "none",
              fontWeight: 700,
              color: "text.secondary",
            },
          }}
        >
          {STORM_WORKSPACE_TABS.map((label) => (
            <Tab key={label} value={label} label={label} />
          ))}
        </Tabs>
      </Box>
      <Box
        sx={{
          p: 2.5,
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          ...subtleScrollbarSx,
        }}
      >
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Storm Workspace
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {activeTab}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 920 }}>
              Use this working area to draft the section narrative, supporting points,
              discriminators, and capture decisions while the hierarchy evolves above.
            </Typography>
          </Box>
          <TextField
            multiline
            minRows={10}
            fullWidth
            placeholder={`Draft the ${activeTab} content here...`}
            value={notesByTab[activeTab] || ""}
            onChange={(event) => onNotesChange(activeTab, event.target.value)}
            InputProps={{
              sx: {
                alignItems: "flex-start",
                fontSize: "0.95rem",
                lineHeight: 1.5,
                bgcolor: "#111827",
                overscrollBehavior: "contain",
              },
            }}
          />
        </Stack>
      </Box>
    </Paper>
  );
}

export function StudioApp() {
  const [mounted, setMounted] = useState(false);
  const [workspace, setWorkspace] = useState(buildEmptyWorkspace);
  const [stormWorkspaceTab, setStormWorkspaceTab] = useState(STORM_WORKSPACE_TABS[0]);
  const [stormWorkspaceNotes, setStormWorkspaceNotes] = useState(buildEmptyStormWorkspace);
  const [stormWorkspaceHeight, setStormWorkspaceHeight] = useState(BOTTOM_DOCK_DEFAULT_HEIGHT);
  const [activeSectionId, setActiveSectionId] = useState("");
  const [selectedRequirementId, setSelectedRequirementId] = useState("");
  const [uploadState, setUploadState] = useState({
    loading: false,
    error: "",
  });
  const [leftRailWidth, setLeftRailWidth] = useState(LEFT_RAIL_DEFAULT_WIDTH);
  const [rightRailWidth, setRightRailWidth] = useState(RIGHT_RAIL_DEFAULT_WIDTH);
  const [leftRailCollapsed, setLeftRailCollapsed] = useState(false);
  const [rightRailCollapsed, setRightRailCollapsed] = useState(false);
  const [collapsedRequirementIds, setCollapsedRequirementIds] = useState(() => new Set());

  const sections = workspace.sections;
  const requirements = workspace.requirements;
  const unassignedRequirements = getSectionRoots(requirements, "unassigned");
  const displaySections = useMemo(
    () =>
      unassignedRequirements.length
        ? [...sections, UNASSIGNED_SECTION]
        : sections,
    [sections, unassignedRequirements.length],
  );
  const activeSection =
    displaySections.find((section) => section.id === activeSectionId) ?? displaySections[0] ?? null;
  const selectedRequirement = getRequirementById(requirements, selectedRequirementId);

  const workspaceStats = useMemo(() => {
    const extractedCount = requirements.filter(
      (requirement) => requirement.sourceType === "extracted",
    ).length;
    const manualCount = requirements.filter(
      (requirement) => requirement.sourceType === "manual",
    ).length;
    return {
      sections: displaySections.length,
      requirements: requirements.length,
      extractedCount,
      manualCount,
    };
  }, [displaySections.length, requirements]);

  useEffect(() => {
    setMounted(true);
    try {
      const savedState = window.localStorage.getItem(STUDIO_STATE_STORAGE_KEY);
      if (!savedState) {
        return;
      }

      const parsed = JSON.parse(savedState);
      if (parsed?.workspace) {
        setWorkspace(parsed.workspace);
      }
      if (typeof parsed?.activeSectionId === "string") {
        setActiveSectionId(parsed.activeSectionId);
      }
      if (typeof parsed?.selectedRequirementId === "string") {
        setSelectedRequirementId(parsed.selectedRequirementId);
      }
      if (typeof parsed?.stormWorkspaceTab === "string") {
        setStormWorkspaceTab(parsed.stormWorkspaceTab);
      }
      if (parsed?.stormWorkspaceNotes && typeof parsed.stormWorkspaceNotes === "object") {
        setStormWorkspaceNotes({
          ...buildEmptyStormWorkspace(),
          ...parsed.stormWorkspaceNotes,
        });
      }
      if (typeof parsed?.stormWorkspaceHeight === "number") {
        setStormWorkspaceHeight(clampDockHeight(parsed.stormWorkspaceHeight));
      }
      if (typeof parsed?.leftRailWidth === "number") {
        setLeftRailWidth(clampRailWidth(parsed.leftRailWidth));
      }
      if (typeof parsed?.rightRailWidth === "number") {
        setRightRailWidth(clampRailWidth(parsed.rightRailWidth));
      }
      if (typeof parsed?.leftRailCollapsed === "boolean") {
        setLeftRailCollapsed(parsed.leftRailCollapsed);
      }
      if (typeof parsed?.rightRailCollapsed === "boolean") {
        setRightRailCollapsed(parsed.rightRailCollapsed);
      }
    } catch (error) {
      console.warn("Failed to restore StormSurge studio state", error);
    }
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const hasActiveSection = sections.some((section) => section.id === activeSectionId);
    if (!hasActiveSection && sections.length) {
      setActiveSectionId(sections[0].id);
    }

    const hasSelectedRequirement = requirements.some(
      (requirement) => requirement.id === selectedRequirementId,
    );
    if (!hasSelectedRequirement) {
      const fallbackSectionId = hasActiveSection ? activeSectionId : sections[0]?.id;
      const fallbackRequirement = fallbackSectionId
        ? getSectionRoots(requirements, fallbackSectionId)[0]
        : null;
      setSelectedRequirementId(fallbackRequirement?.id ?? "");
    }
  }, [mounted, sections, requirements, activeSectionId, selectedRequirementId]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    window.localStorage.setItem(
      STUDIO_STATE_STORAGE_KEY,
      JSON.stringify({
        workspace,
        activeSectionId,
        selectedRequirementId,
        stormWorkspaceTab,
        stormWorkspaceNotes,
        stormWorkspaceHeight,
        leftRailWidth,
        rightRailWidth,
        leftRailCollapsed,
        rightRailCollapsed,
      }),
    );
  }, [
    mounted,
    workspace,
    activeSectionId,
    selectedRequirementId,
    stormWorkspaceTab,
    stormWorkspaceNotes,
    stormWorkspaceHeight,
    leftRailWidth,
    rightRailWidth,
    leftRailCollapsed,
    rightRailCollapsed,
  ]);

  const leftRailDisplayWidth = leftRailCollapsed ? RAIL_COLLAPSED_WIDTH : leftRailWidth;
  const rightRailDisplayWidth = rightRailCollapsed ? RAIL_COLLAPSED_WIDTH : rightRailWidth;
  const sectionTabSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function startRailResize(side) {
    return (event) => {
      event.preventDefault();

      const handleMove = (moveEvent) => {
        if (side === "left") {
          setLeftRailCollapsed(false);
          setLeftRailWidth(clampRailWidth(moveEvent.clientX));
          return;
        }

        setRightRailCollapsed(false);
        setRightRailWidth(clampRailWidth(window.innerWidth - moveEvent.clientX));
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    };
  }

  function startDockResize(event) {
    event.preventDefault();

    const handleMove = (moveEvent) => {
      const nextHeight = window.innerHeight - moveEvent.clientY - 12;
      setStormWorkspaceHeight(clampDockHeight(nextHeight));
    };

    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  function selectSection(sectionId) {
    setActiveSectionId(sectionId);
    const firstRequirement = getSectionRoots(requirements, sectionId)[0];
    if (firstRequirement) {
      setSelectedRequirementId(firstRequirement.id);
    }
  }

  function selectRequirement(requirementId) {
    setSelectedRequirementId(requirementId);
    const requirement = getRequirementById(requirements, requirementId);
    if (requirement) {
      setActiveSectionId(requirement.sectionId);
    }
  }

  function patchSelectedRequirement(updater) {
    if (!selectedRequirement) {
      return;
    }

    setWorkspace((current) => ({
      ...current,
      requirements: current.requirements.map((requirement) =>
        requirement.id === selectedRequirement.id
          ? updater(requirement)
          : requirement,
      ),
    }));
  }

  function handleRequirementChange(field, value) {
    patchSelectedRequirement((requirement) => {
      const nextRequirement = { ...requirement, [field]: value };
      if (field === "text") {
        nextRequirement.summary = value.slice(0, 160) || requirement.summary;
      }
      return nextRequirement;
    });
  }

  function handleCreateTopLevelRequirement() {
    if (!activeSection || activeSection.id === "unassigned") {
      return;
    }

    const nextRequirement = createTopLevelRequirement(activeSection.id);

    setWorkspace((current) => {
      const siblingCount = getSectionRoots(current.requirements, activeSection.id).length;
      return {
        ...current,
        requirements: [
          ...current.requirements,
          { ...nextRequirement, position: siblingCount + 1 },
        ],
      };
    });
    setSelectedRequirementId(nextRequirement.id);
  }

  function handleCreateChildRequirement() {
    if (!selectedRequirement || selectedRequirement.sectionId === "unassigned") {
      return;
    }

    const nextRequirement = createChildRequirement(selectedRequirement, requirements);
    setWorkspace((current) => ({
      ...current,
      requirements: [...current.requirements, nextRequirement],
    }));
    setSelectedRequirementId(nextRequirement.id);
  }

  function handleAssignToActiveSection() {
    if (!selectedRequirement || !activeSection) {
      return;
    }

    setWorkspace((current) => ({
      ...current,
      requirements: reassignRequirement(
        current.requirements,
        selectedRequirement.id,
        activeSection.id,
      ),
    }));
  }

  function handleMoveToUnassigned() {
    if (!selectedRequirement) {
      return;
    }

    setWorkspace((current) => ({
      ...current,
      requirements: reassignRequirement(
        current.requirements,
        selectedRequirement.id,
        "unassigned",
      ),
    }));
  }

  function handleMoveRequirement(direction) {
    if (!selectedRequirement) {
      return;
    }

    setWorkspace((current) => ({
      ...current,
      requirements: moveRequirement(
        current.requirements,
        selectedRequirement.id,
        direction,
      ),
    }));
  }

  function handlePromoteRequirement() {
    if (!selectedRequirement) {
      return;
    }

    setWorkspace((current) => ({
      ...current,
      requirements: promoteRequirement(current.requirements, selectedRequirement.id),
    }));
  }

  function handleDemoteRequirement() {
    if (!selectedRequirement) {
      return;
    }

    setWorkspace((current) => ({
      ...current,
      requirements: demoteRequirement(current.requirements, selectedRequirement.id),
    }));
  }

  function handleReorderRequirements(nextRequirements) {
    setWorkspace((current) => ({
      ...current,
      requirements: nextRequirements,
    }));
  }

  function handleSectionTabDragEnd(event) {
    const { active, over } = event;
    if (!active?.id || !over?.id || active.id === over.id) {
      return;
    }

    if (active.id === "unassigned" || over.id === "unassigned") {
      return;
    }

    const oldIndex = sections.findIndex((section) => section.id === active.id);
    const newIndex = sections.findIndex((section) => section.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    setWorkspace((current) => ({
      ...current,
      sections: arrayMove(current.sections, oldIndex, newIndex),
    }));
  }

  function toggleCollapsedRequirement(requirementId) {
    setCollapsedRequirementIds((current) => {
      const next = new Set(current);
      if (next.has(requirementId)) {
        next.delete(requirementId);
      } else {
        next.add(requirementId);
      }
      return next;
    });
  }

  function expandAllRequirements() {
    setCollapsedRequirementIds(new Set());
  }

  function collapseAllRequirements() {
    const parentIds = new Set(
      requirements
        .filter((requirement) =>
          requirements.some((candidate) => candidate.parentId === requirement.id),
        )
        .map((requirement) => requirement.id),
    );
    setCollapsedRequirementIds(parentIds);
  }

  const hasCollapsibleRequirements = requirements.some((requirement) =>
    requirements.some((candidate) => candidate.parentId === requirement.id),
  );

  function handleCreateSectionFromRequirement() {
    if (!selectedRequirement) {
      return;
    }

    const defaultLabel =
      selectedRequirement.title || `Custom Section ${sections.length + 1}`;
    const label = window.prompt("New section tab name", defaultLabel);
    if (label === null) {
      return;
    }

    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      return;
    }

    const nextSection = buildCustomSection(trimmedLabel, sections.length);

    setWorkspace((current) => ({
      ...current,
      sections: [...current.sections, nextSection],
      requirements: reassignRequirement(
        current.requirements,
        selectedRequirement.id,
        nextSection.id,
      ),
    }));
    setActiveSectionId(nextSection.id);
    setSelectedRequirementId(selectedRequirement.id);
  }

  function handleRenameSection(sectionId) {
    const section = sections.find((entry) => entry.id === sectionId);
    if (!section) {
      return;
    }

    const label = window.prompt("Rename section tab", section.label);
    if (label === null) {
      return;
    }

    const trimmedLabel = label.trim();
    if (!trimmedLabel || trimmedLabel === section.label) {
      return;
    }

    setWorkspace((current) => ({
      ...current,
      sections: current.sections.map((entry) =>
        entry.id === sectionId
          ? {
              ...entry,
              label: trimmedLabel,
              shortLabel:
                entry.sourceKind === "manual" || !entry.shortLabel
                  ? buildSectionShortLabel(trimmedLabel)
                  : entry.shortLabel,
            }
          : entry,
      ),
    }));
  }

  function handleStormWorkspaceNoteChange(tab, value) {
    setStormWorkspaceNotes((current) => ({
      ...current,
      [tab]: value,
    }));
  }

  async function handleOutlineUpload(file) {
    setUploadState({ loading: true, error: "" });

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/pws/outline-upload", {
        method: "POST",
        body,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "Upload failed");
      }

      const payload = await response.json();
      const nextWorkspace = transformOutlineToWorkspace(payload);
      setWorkspace(nextWorkspace);
      setActiveSectionId(nextWorkspace.sections[0]?.id ?? "");
      setSelectedRequirementId(
        getSectionRoots(nextWorkspace.requirements, nextWorkspace.sections[0]?.id ?? "")[0]
          ?.id ?? "",
      );
    } catch (error) {
      setUploadState({
        loading: false,
        error: error instanceof Error ? error.message : "Upload failed",
      });
      return;
    }

    setUploadState({ loading: false, error: "" });
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", xl: "row" },
        height: "100vh",
        bgcolor: "background.default",
        overflow: "hidden",
      }}
    >
      <AppBar
        position="fixed"
        color="transparent"
        elevation={0}
        sx={{
          left: 0,
          right: 0,
          borderBottom: 1,
          borderColor: "divider",
          backdropFilter: "blur(14px)",
          bgcolor: "rgba(11, 18, 32, 0.78)",
          pl: 2,
          pr: 2,
          transition: "padding 180ms ease",
        }}
      >
        <Toolbar sx={{ gap: 2, minHeight: 80, pl: 0 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              StormSurge Studio
            </Typography>
          </Box>
          <UploadWorkspaceCard loading={uploadState.loading} onUpload={handleOutlineUpload} compact />
          {workspace.sourceFilename ? (
            <Chip
              color="primary"
              variant="outlined"
              icon={<InsightsRounded />}
              label={workspace.sourceFilename}
            />
          ) : null}
          <Chip label={`${workspaceStats.sections} tabs`} variant="outlined" />
          <Chip label={`${workspaceStats.requirements} nodes`} variant="outlined" />
        </Toolbar>
      </AppBar>

      <RailShell
        side="left"
        title="Workspace"
        subtitle="Navigation"
        width={leftRailDisplayWidth}
        collapsed={leftRailCollapsed}
        onToggleCollapsed={() => setLeftRailCollapsed((current) => !current)}
        onResizeStart={startRailResize("left")}
      >
        {uploadState.error ? <Alert severity="error">{uploadState.error}</Alert> : null}

        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <HubRounded color="primary" />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Section Tabs
            </Typography>
          </Stack>
          <DndContext
            sensors={sectionTabSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSectionTabDragEnd}
          >
            <SortableContext
              items={sections.map((section) => section.id)}
              strategy={verticalListSortingStrategy}
            >
              <List sx={{ mt: 1, border: 1, borderColor: "divider", borderRadius: 1, p: 1 }}>
                {sections.map((section) => (
                  <SortableSectionTab
                    key={section.id}
                    section={section}
                    selected={section.id === activeSectionId}
                    onSelect={selectSection}
                    onRename={handleRenameSection}
                  />
                ))}
                {unassignedRequirements.length ? (
                  <ListItemButton
                    selected={activeSectionId === "unassigned"}
                    onClick={() => selectSection("unassigned")}
                    sx={{ borderRadius: 1, mt: 0.5 }}
                  >
                    <ListItemText primary={UNASSIGNED_SECTION.label} />
                  </ListItemButton>
                ) : null}
              </List>
            </SortableContext>
          </DndContext>
        </Box>
      </RailShell>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          pl: { xs: 0.375, md: 0.5, xl: 0.75 },
          pr: { xs: 0.75, md: 1, xl: 1.25 },
          py: 2,
          overflow: "hidden",
          overscrollBehavior: "contain",
        }}
      >
        <Toolbar sx={{ minHeight: 80 }} />
        <Box
          sx={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            ...subtleScrollbarSx,
            overscrollBehavior: "contain",
          }}
        >
        <Stack spacing={3} sx={{ minHeight: "100%" }}>
          {uploadState.loading ? (
            <Paper variant="outlined" sx={{ p: 6, borderRadius: 1 }}>
              <Stack spacing={2} alignItems="center">
                <CircularProgress />
                <Typography variant="h6">Building hierarchy from uploaded PWS</Typography>
                <Typography variant="body2" color="text.secondary">
                  StormSurge is running the structuring pipeline and converting the result
                  into editable workspace objects.
                </Typography>
              </Stack>
            </Paper>
          ) : null}

          {!sections.length && !uploadState.loading ? (
            <Paper variant="outlined" sx={{ p: 6, borderRadius: 1 }}>
              <Stack spacing={2} alignItems="flex-start">
                <CloudUploadRounded color="primary" sx={{ fontSize: 40 }} />
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  Upload a PWS to start
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 720 }}>
                  Use the upload control on the left to ingest a PDF, DOCX, TXT, or
                  Markdown PWS. StormSurge will restore the extracted hierarchy and split
                  the top-level sections into working tabs.
                </Typography>
              </Stack>
            </Paper>
          ) : null}

          {sections.length && mounted ? (
            <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
              <WorkspaceCanvas
                section={activeSection}
                allRequirements={requirements}
                selectedRequirementId={selectedRequirementId}
                onReorderRequirements={handleReorderRequirements}
                onSelectRequirement={selectRequirement}
                collapsedIds={collapsedRequirementIds}
                onToggleCollapsed={toggleCollapsedRequirement}
              />
            </Box>
          ) : null}

          <Divider />
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label="MUI shell" variant="outlined" />
            <Chip label="dnd-kit ordering" variant="outlined" />
            <Chip label="PWS outline upload" variant="outlined" />
            <Chip label="Single shared LLM preserved" variant="outlined" />
          </Stack>
        </Stack>
        </Box>
        <Box
          sx={{
            flexShrink: 0,
            height: stormWorkspaceHeight,
            position: "relative",
          }}
        >
          <Box
            onMouseDown={startDockResize}
            sx={{
              position: "absolute",
              top: -8,
              left: 0,
              right: 0,
              height: 16,
              cursor: "row-resize",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1,
              "&::before": {
                content: '""',
                width: 72,
                height: 6,
                borderRadius: 999,
                bgcolor: "rgba(148, 163, 184, 0.42)",
              },
              "&:hover::before": {
                bgcolor: "rgba(148, 163, 184, 0.72)",
              },
            }}
          />
          <StormWorkspaceBar
            activeTab={stormWorkspaceTab}
            onTabChange={setStormWorkspaceTab}
            notesByTab={stormWorkspaceNotes}
            onNotesChange={handleStormWorkspaceNoteChange}
          />
        </Box>
      </Box>

      <RailShell
        side="right"
        title="Inspector"
        subtitle="Selection"
        width={rightRailDisplayWidth}
        collapsed={rightRailCollapsed}
        onToggleCollapsed={() => setRightRailCollapsed((current) => !current)}
        onResizeStart={startRailResize("right")}
      >
        <DetailInspector
          section={activeSection}
          requirement={selectedRequirement}
          sections={sections}
          hasCollapsibleRequirements={hasCollapsibleRequirements}
          onCreateTopLevelRequirement={handleCreateTopLevelRequirement}
          onCreateChildRequirement={handleCreateChildRequirement}
          onExpandAllRequirements={expandAllRequirements}
          onCollapseAllRequirements={collapseAllRequirements}
          onRequirementChange={handleRequirementChange}
          onAssignToSection={handleAssignToActiveSection}
          onMoveRequirement={handleMoveRequirement}
          onMoveToUnassigned={handleMoveToUnassigned}
          onPromoteRequirement={handlePromoteRequirement}
          onDemoteRequirement={handleDemoteRequirement}
          onCreateSectionFromRequirement={handleCreateSectionFromRequirement}
        />
      </RailShell>
    </Box>
  );
}
