"use client";

import { useEffect, useMemo, useState } from "react";
import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import CloudUploadRounded from "@mui/icons-material/CloudUploadRounded";
import DragIndicatorRounded from "@mui/icons-material/DragIndicatorRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import HomeRounded from "@mui/icons-material/HomeRounded";
import InsightsRounded from "@mui/icons-material/InsightsRounded";
import SaveRounded from "@mui/icons-material/SaveRounded";
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
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  getChildren,
  getRequirementById,
  getSiblingGroup,
  getSectionRoots,
  insertRequirementInGroup,
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
const SAVED_PROJECTS_STORAGE_KEY = "stormsurge-studio-saved-projects-v1";
const STORM_WORKSPACE_TABS = [
  "MTS Definition",
  "MTS Solution",
  "Exceeds the Standard",
  "Risks",
];

const SHORT_STORM_WORKSPACE_TABS = new Set(["MTS Definition", "MTS Solution"]);
const UNASSIGNED_SECTION = {
  id: "unassigned",
  label: "Unassigned Requirements",
  shortLabel: "UNAS",
  sourceKind: "system",
  sectionNumber: null,
};
const subtleScrollbarSx = {
  scrollbarWidth: "thin",
  scrollbarColor: "rgba(58, 72, 96, 0.16) transparent",
  "&::-webkit-scrollbar": {
    width: 8,
    height: 8,
  },
  "&::-webkit-scrollbar-track": {
    background: "transparent",
  },
  "&::-webkit-scrollbar-thumb": {
    backgroundColor: "rgba(58, 72, 96, 0.14)",
    borderRadius: 999,
    border: "2px solid transparent",
    backgroundClip: "padding-box",
  },
  "&:hover::-webkit-scrollbar-thumb": {
    backgroundColor: "rgba(72, 88, 116, 0.24)",
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

function buildSectionBarSx(selected) {
  return {
    position: "relative",
    overflow: "hidden",
    alignItems: "stretch",
    borderRadius: 0.75,
    mb: 0.75,
    px: 1.1,
    py: 0.1,
    minHeight: 48,
    bgcolor: selected ? "rgba(32, 44, 66, 0.96)" : "rgba(18, 23, 31, 0.92)",
    border: "1px solid",
    borderColor: selected ? "rgba(110, 168, 254, 0.3)" : "rgba(40, 53, 74, 0.9)",
    boxShadow: selected ? "0 10px 22px rgba(5, 11, 22, 0.22)" : "none",
    transition: "border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease",
    "&:hover": {
      bgcolor: selected ? "rgba(35, 49, 72, 0.98)" : "rgba(23, 29, 38, 0.96)",
      borderColor: selected ? "rgba(110, 168, 254, 0.34)" : "rgba(54, 71, 97, 0.92)",
    },
  };
}

function SectionTabContent({ section, selected, dragHandleProps, onRename }) {
  return (
    <>
      <Box
        {...dragHandleProps}
        onClick={(event) => event.stopPropagation()}
        sx={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 6,
          bgcolor: selected ? "primary.light" : "primary.main",
          opacity: selected ? 0.82 : 0.34,
          cursor: dragHandleProps ? "grab" : "default",
        }}
      />
      <Stack direction="row" spacing={1.1} alignItems="center" sx={{ width: "100%" }}>
        <Box sx={{ flexGrow: 1, minWidth: 0, py: 0.7, pl: 0.8 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: selected ? 700 : 600,
              lineHeight: 1.2,
              color: "text.primary",
            }}
          >
            {section.label}
          </Typography>
        </Box>
        {onRename ? (
          <Tooltip title="Rename section tab">
            <IconButton
              size="small"
              edge="end"
              onClick={(event) => {
                event.stopPropagation();
                onRename(section.id);
              }}
              sx={{
                alignSelf: "center",
                color: "text.secondary",
                opacity: selected ? 0.92 : 0.66,
              }}
            >
              <EditRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null}
      </Stack>
    </>
  );
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
        transform: CSS.Transform.toString(transform),
        transition,
        ...buildSectionBarSx(selected),
      }}
    >
      <SectionTabContent
        section={section}
        selected={selected}
        dragHandleProps={{ ...attributes, ...listeners }}
        onRename={onRename}
      />
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
        borderColor: "rgba(26, 35, 49, 0.42)",
        bgcolor: isLeft ? "#0E1116" : "#11151B",
        backgroundImage: isLeft
          ? "linear-gradient(180deg, rgba(14,17,22,0.98), rgba(12,15,20,0.98))"
          : "linear-gradient(180deg, rgba(17,21,27,0.98), rgba(14,18,24,0.98))",
        transition: "width 180ms ease",
        overflow: "hidden",
        overscrollBehavior: "contain",
      }}
    >
      <Toolbar sx={{ minHeight: 80 }} />
      <Box
        sx={{
          px: 1.5,
          py: 1.25,
          display: "flex",
          justifyContent: collapsed ? "center" : "space-between",
          alignItems: "center",
          flexShrink: 0,
          borderBottom: 1,
          borderColor: "rgba(28, 38, 54, 0.42)",
        }}
      >
        {collapsed ? null : (
          <Box sx={{ minWidth: 0 }}>
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
            p: 2.25,
            pt: 1.5,
            display: "grid",
            gap: 2,
            overflowY: "auto",
            minHeight: 0,
            flex: "1 1 auto",
            ...subtleScrollbarSx,
            overscrollBehavior: "contain",
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
            width: 5,
            height: 56,
            borderRadius: 999,
            bgcolor: "rgba(61, 79, 106, 0.62)",
          },
          "&:hover::before": {
            bgcolor: "rgba(110, 168, 254, 0.5)",
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

function buildDefaultMtsDefinitionPrompt(sectionLabel) {
  const scopedSection = String(sectionLabel || "this section").trim();
  return [
    `Draft an MTS Definition for ${scopedSection}.`,
    "MTS means Meets the Standard.",
    "Read the requirements as a group.",
    "Identify the common baseline expectation across them.",
    "Define the minimum credible, compliant, and executable approach.",
    "Focus on what would make a government evaluator conclude the offeror understands the work and can perform it with acceptable risk.",
    "Include expected elements such as approach, process, staffing, tools, governance, deliverables, and performance controls only if they are clearly implied by the requirements.",
    "Do not write strengths, discriminators, or win themes.",
    "Do not just restate the requirements.",
    "Do not use marketing language.",
    "Write in practical evaluator-facing language.",
    "Use 2 to 3 short paragraphs.",
    "Do not use headings, bullets, markdown emphasis, or labels.",
    "Do not mention source metadata, internal tooling, or the phrase 'Meets the Standard' in the response body.",
  ].join(" ");
}

function normalizeStormWorkspaceNotes(notesBySection) {
  if (!notesBySection || typeof notesBySection !== "object" || Array.isArray(notesBySection)) {
    return {};
  }

  return Object.entries(notesBySection).reduce((accumulator, [sectionId, notes]) => {
    if (!notes || typeof notes !== "object" || Array.isArray(notes)) {
      return accumulator;
    }

    accumulator[sectionId] = {
      ...buildEmptyStormWorkspace(),
      ...notes,
    };
    return accumulator;
  }, {});
}

function normalizeSavedProjects(savedProjects) {
  if (!Array.isArray(savedProjects)) {
    return [];
  }

  return savedProjects.filter(
    (project) =>
      project &&
      typeof project === "object" &&
      typeof project.id === "string" &&
      typeof project.name === "string" &&
      project.snapshot &&
      typeof project.snapshot === "object",
  );
}

function getSectionRequirementScope(requirements, sectionId) {
  const orderedRequirements = [];
  const visit = (requirement, depth) => {
    orderedRequirements.push({ requirement, depth });
    getChildren(requirements, requirement.id).forEach((child) => visit(child, depth + 1));
  };

  getSectionRoots(requirements, sectionId).forEach((requirement) => visit(requirement, 0));
  return orderedRequirements;
}

function StormWorkspaceBar({
  activeTab,
  onTabChange,
  notesByTab,
  onNotesChange,
  onGenerateMtsDefinition,
  onClearActiveTab,
  onEditMtsPrompt,
  generationState,
  activeSection,
  activeSectionRequirementCount,
}) {
  const canGenerateMtsDefinition =
    activeTab === "MTS Definition" &&
    Boolean(activeSection?.id) &&
    activeSectionRequirementCount > 0 &&
    !generationState.loading;

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: { xs: 0.75, xl: 0 },
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        height: "100%",
        bgcolor: "#141920",
        backgroundImage: "none",
        boxShadow: { xs: "0 18px 34px rgba(2, 6, 23, 0.36)", xl: "none" },
        borderTop: 1,
        borderLeft: { xs: 1, xl: 0 },
        borderRight: { xs: 1, xl: 0 },
        borderBottom: 0,
        borderColor: "rgba(28, 38, 54, 0.38)",
      }}
    >
      <Box
        sx={{
          borderBottom: 1,
          borderColor: "rgba(28, 38, 54, 0.32)",
          px: 1.25,
          pt: 0.35,
          background: "linear-gradient(180deg, #151A22 0%, #12171E 100%)",
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
            minHeight: 38,
            "& .MuiTabs-indicator": {
              display: "none",
            },
            "& .MuiTabs-flexContainer": {
              alignItems: "flex-end",
            },
            "& .MuiTab-root": {
              minHeight: 38,
              px: 1.5,
              py: 0.35,
              mr: 0.5,
              borderTopLeftRadius: 4,
              borderTopRightRadius: 4,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              border: "1px solid transparent",
              borderBottom: 0,
              alignItems: "center",
              color: "#93A0B5",
              bgcolor: "transparent",
            },
            "& .MuiTab-root.Mui-selected": {
              color: "#F8FBFF",
              bgcolor: "#1A2940",
              borderColor: "rgba(78, 128, 208, 0.56)",
              boxShadow: "inset 0 2px 0 rgba(116, 167, 255, 0.82)",
            },
          }}
        >
          {STORM_WORKSPACE_TABS.map((label) => (
            <Tab
              key={label}
              value={label}
              label={label}
              sx={
                SHORT_STORM_WORKSPACE_TABS.has(label)
                  ? {
                      minHeight: 20,
                      py: 0.05,
                      mt: "auto",
                      "&.MuiTab-root": {
                        minHeight: 20,
                      },
                    }
                  : undefined
              }
            />
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
          backgroundColor: "#141920",
          ...subtleScrollbarSx,
        }}
      >
        <Stack spacing={1.5}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            alignItems={{ xs: "flex-start", md: "center" }}
            justifyContent="space-between"
          >
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {activeTab}
              </Typography>
              {activeSection ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                  {activeSection.label} · {activeSectionRequirementCount} requirement
                  {activeSectionRequirementCount === 1 ? "" : "s"}
                </Typography>
              ) : null}
            </Box>
            {activeTab === "MTS Definition" ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <Button variant="outlined" onClick={onClearActiveTab}>
                  Clear
                </Button>
                <Button variant="outlined" onClick={onEditMtsPrompt}>
                  Edit Prompt
                </Button>
                <Button
                  variant="contained"
                  onClick={onGenerateMtsDefinition}
                  disabled={!canGenerateMtsDefinition}
                  startIcon={
                    generationState.loading ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : null
                  }
                >
                  {generationState.loading ? "Generating..." : "Generate Definition"}
                </Button>
              </Stack>
            ) : (
              <Button variant="outlined" onClick={onClearActiveTab}>
                Clear
              </Button>
            )}
          </Stack>
          {generationState.error && activeTab === "MTS Definition" ? (
            <Alert severity="error">{generationState.error}</Alert>
          ) : null}
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
                bgcolor: "#1A1F27",
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
  const [stormWorkspaceNotes, setStormWorkspaceNotes] = useState({});
  const [stormWorkspacePrompts, setStormWorkspacePrompts] = useState({});
  const [savedProjects, setSavedProjects] = useState([]);
  const [mtsPromptDialogOpen, setMtsPromptDialogOpen] = useState(false);
  const [mtsPromptDraft, setMtsPromptDraft] = useState("");
  const [homeDialogOpen, setHomeDialogOpen] = useState(false);
  const [stormWorkspaceHeight, setStormWorkspaceHeight] = useState(BOTTOM_DOCK_DEFAULT_HEIGHT);
  const [activeSectionId, setActiveSectionId] = useState("");
  const [selectedRequirementId, setSelectedRequirementId] = useState("");
  const [uploadState, setUploadState] = useState({
    loading: false,
    error: "",
  });
  const [mtsDefinitionGenerationState, setMtsDefinitionGenerationState] = useState({
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
  const activeSectionRequirements = useMemo(
    () => (activeSection ? getSectionRequirementScope(requirements, activeSection.id) : []),
    [activeSection, requirements],
  );
  const activeSectionStormWorkspaceNotes = useMemo(() => {
    if (!activeSection?.id) {
      return buildEmptyStormWorkspace();
    }

    return {
      ...buildEmptyStormWorkspace(),
      ...(stormWorkspaceNotes[activeSection.id] || {}),
    };
  }, [activeSection, stormWorkspaceNotes]);
  const activeSectionMtsPrompt = useMemo(() => {
    if (!activeSection?.id) {
      return buildDefaultMtsDefinitionPrompt("this section");
    }

    return (
      String(stormWorkspacePrompts[activeSection.id] || "").trim() ||
      buildDefaultMtsDefinitionPrompt(activeSection.label)
    );
  }, [activeSection, stormWorkspacePrompts]);

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
  const isHomeScreen = !sections.length;

  function buildStudioSnapshot() {
    return {
      workspace,
      activeSectionId,
      selectedRequirementId,
      stormWorkspaceTab,
      stormWorkspaceNotes,
      stormWorkspacePrompts,
      stormWorkspaceHeight,
      leftRailWidth,
      rightRailWidth,
      leftRailCollapsed,
      rightRailCollapsed,
    };
  }

  function resetToHomeScreen() {
    setWorkspace(buildEmptyWorkspace());
    setStormWorkspaceTab(STORM_WORKSPACE_TABS[0]);
    setStormWorkspaceNotes({});
    setStormWorkspacePrompts({});
    setActiveSectionId("");
    setSelectedRequirementId("");
    setCollapsedRequirementIds(new Set());
    setUploadState({ loading: false, error: "" });
    setMtsDefinitionGenerationState({ loading: false, error: "" });
  }

  function restoreStudioSnapshot(snapshot) {
    setWorkspace(snapshot?.workspace ? snapshot.workspace : buildEmptyWorkspace());
    setActiveSectionId(typeof snapshot?.activeSectionId === "string" ? snapshot.activeSectionId : "");
    setSelectedRequirementId(
      typeof snapshot?.selectedRequirementId === "string" ? snapshot.selectedRequirementId : "",
    );
    setStormWorkspaceTab(
      typeof snapshot?.stormWorkspaceTab === "string"
        ? snapshot.stormWorkspaceTab
        : STORM_WORKSPACE_TABS[0],
    );
    setStormWorkspaceNotes(normalizeStormWorkspaceNotes(snapshot?.stormWorkspaceNotes));
    setStormWorkspacePrompts(
      snapshot?.stormWorkspacePrompts &&
        typeof snapshot.stormWorkspacePrompts === "object" &&
        !Array.isArray(snapshot.stormWorkspacePrompts)
        ? snapshot.stormWorkspacePrompts
        : {},
    );
    setStormWorkspaceHeight(
      typeof snapshot?.stormWorkspaceHeight === "number"
        ? clampDockHeight(snapshot.stormWorkspaceHeight)
        : BOTTOM_DOCK_DEFAULT_HEIGHT,
    );
    setLeftRailWidth(
      typeof snapshot?.leftRailWidth === "number"
        ? clampRailWidth(snapshot.leftRailWidth)
        : LEFT_RAIL_DEFAULT_WIDTH,
    );
    setRightRailWidth(
      typeof snapshot?.rightRailWidth === "number"
        ? clampRailWidth(snapshot.rightRailWidth)
        : RIGHT_RAIL_DEFAULT_WIDTH,
    );
    setLeftRailCollapsed(
      typeof snapshot?.leftRailCollapsed === "boolean" ? snapshot.leftRailCollapsed : false,
    );
    setRightRailCollapsed(
      typeof snapshot?.rightRailCollapsed === "boolean" ? snapshot.rightRailCollapsed : false,
    );
    setCollapsedRequirementIds(new Set());
    setUploadState({ loading: false, error: "" });
    setMtsDefinitionGenerationState({ loading: false, error: "" });
  }

  useEffect(() => {
    setMounted(true);
    try {
      const savedState = window.localStorage.getItem(STUDIO_STATE_STORAGE_KEY);
      if (savedState) {
        const parsed = JSON.parse(savedState);
        if (parsed?.stormWorkspaceNotes && typeof parsed.stormWorkspaceNotes === "object") {
          const hasLegacyShape = STORM_WORKSPACE_TABS.some(
            (tab) => typeof parsed.stormWorkspaceNotes?.[tab] === "string",
          );
          const restoredActiveSectionId =
            typeof parsed?.activeSectionId === "string" ? parsed.activeSectionId : "";

          if (hasLegacyShape && restoredActiveSectionId) {
            parsed.stormWorkspaceNotes = {
              [restoredActiveSectionId]: {
                ...buildEmptyStormWorkspace(),
                ...parsed.stormWorkspaceNotes,
              },
            };
          }
        }
        restoreStudioSnapshot(parsed);
      }

      const savedProjectsState = window.localStorage.getItem(SAVED_PROJECTS_STORAGE_KEY);
      if (savedProjectsState) {
        setSavedProjects(normalizeSavedProjects(JSON.parse(savedProjectsState)));
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
    setMtsDefinitionGenerationState({ loading: false, error: "" });
  }, [activeSectionId]);

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
        stormWorkspacePrompts,
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
    stormWorkspacePrompts,
    stormWorkspaceHeight,
    leftRailWidth,
    rightRailWidth,
    leftRailCollapsed,
    rightRailCollapsed,
  ]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    window.localStorage.setItem(
      SAVED_PROJECTS_STORAGE_KEY,
      JSON.stringify(savedProjects),
    );
  }, [mounted, savedProjects]);

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

    let insertedRequirement = createTopLevelRequirement(activeSection.id);
    setWorkspace((current) => {
      const currentSelectedRequirement = selectedRequirementId
        ? getRequirementById(current.requirements, selectedRequirementId)
        : null;

      if (
        currentSelectedRequirement &&
        currentSelectedRequirement.sectionId === activeSection.id
      ) {
        const siblingGroup = getSiblingGroup(current.requirements, currentSelectedRequirement);
        const selectedIndex = siblingGroup.findIndex(
          (requirement) => requirement.id === currentSelectedRequirement.id,
        );
        insertedRequirement = {
          ...insertedRequirement,
          sectionId: currentSelectedRequirement.sectionId,
          parentId: currentSelectedRequirement.parentId,
          kind: currentSelectedRequirement.parentId === null ? "top-level" : "child",
        };

        return {
          ...current,
          requirements: insertRequirementInGroup(
            current.requirements,
            insertedRequirement,
            siblingGroup,
            selectedIndex + 1,
          ),
        };
      }

      insertedRequirement = {
        ...insertedRequirement,
        sectionId: activeSection.id,
        parentId: null,
        kind: "top-level",
      };

      return {
        ...current,
        requirements: insertRequirementInGroup(
          current.requirements,
          insertedRequirement,
          getSectionRoots(current.requirements, activeSection.id),
          0,
        ),
      };
    });
    setSelectedRequirementId(insertedRequirement.id);
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
    if (!activeSection?.id) {
      return;
    }

    setStormWorkspaceNotes((current) => ({
      ...current,
      [activeSection.id]: {
        ...buildEmptyStormWorkspace(),
        ...(current[activeSection.id] || {}),
        [tab]: value,
      },
    }));
  }

  function handleClearStormWorkspaceTab() {
    if (!activeSection?.id) {
      return;
    }

    setStormWorkspaceNotes((current) => ({
      ...current,
      [activeSection.id]: {
        ...buildEmptyStormWorkspace(),
        ...(current[activeSection.id] || {}),
        [stormWorkspaceTab]: "",
      },
    }));
  }

  function handleEditMtsPrompt() {
    if (!activeSection?.id) {
      return;
    }
    setMtsPromptDraft(activeSectionMtsPrompt);
    setMtsPromptDialogOpen(true);
  }

  function handleCloseMtsPromptDialog() {
    setMtsPromptDialogOpen(false);
  }

  function handleSaveMtsPrompt() {
    if (!activeSection?.id) {
      return;
    }

    const trimmedPrompt = mtsPromptDraft.trim();
    if (!trimmedPrompt) {
      return;
    }

    setStormWorkspacePrompts((current) => ({
      ...current,
      [activeSection.id]: trimmedPrompt,
    }));
    setMtsPromptDialogOpen(false);
  }

  async function handleGenerateMtsDefinition() {
    if (!activeSection || !activeSectionRequirements.length) {
      setMtsDefinitionGenerationState({
        loading: false,
        error: "Select a section that has requirements before generating.",
      });
      return;
    }

    setMtsDefinitionGenerationState({ loading: true, error: "" });
    setStormWorkspaceTab("MTS Definition");
    setStormWorkspaceNotes((current) => ({
      ...current,
      [activeSection.id]: {
        ...buildEmptyStormWorkspace(),
        ...(current[activeSection.id] || {}),
        ["MTS Definition"]: "",
      },
    }));

    try {
      const response = await fetch("/api/storm/mts-definition", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sectionLabel: activeSection.label,
          prompt: activeSectionMtsPrompt,
          requirements: activeSectionRequirements.map(({ requirement }) => ({
            id: requirement.sourceRef || requirement.title || requirement.id,
            section: activeSection.label,
            text: requirement.text || requirement.summary || requirement.title,
          })),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "MTS definition generation failed");
      }

      if (!response.body) {
        throw new Error("MTS definition stream was unavailable");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventType = "message";
      let streamedDefinition = "";

      const applyDefinition = (nextDefinition) => {
        setStormWorkspaceNotes((current) => ({
          ...current,
          [activeSection.id]: {
            ...buildEmptyStormWorkspace(),
            ...(current[activeSection.id] || {}),
            ["MTS Definition"]: nextDefinition,
          },
        }));
      };

      const processEventBlock = (block) => {
        const lines = block.split("\n");
        let nextEventType = "message";
        const dataLines = [];

        for (const line of lines) {
          if (line.startsWith("event:")) {
            nextEventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trim());
          }
        }

        const dataText = dataLines.join("\n");
        if (!dataText) {
          return;
        }

        let parsed;
        try {
          parsed = JSON.parse(dataText);
        } catch {
          return;
        }

        if (nextEventType === "token") {
          streamedDefinition += String(parsed?.delta || "");
          applyDefinition(streamedDefinition);
          return;
        }

        if (nextEventType === "error") {
          let detail = String(parsed?.detail || "").trim();
          try {
            const nested = JSON.parse(detail);
            detail = String(nested?.detail || detail).trim();
          } catch {}
          throw new Error(detail || "MTS definition generation failed");
        }

        eventType = nextEventType;
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          processEventBlock(block);
        }
      }

      if (buffer.trim()) {
        processEventBlock(buffer);
      }

      if (!streamedDefinition.trim() && eventType !== "done") {
        throw new Error("MTS definition generation returned no content");
      }

      setMtsDefinitionGenerationState({ loading: false, error: "" });
    } catch (error) {
      setMtsDefinitionGenerationState({
        loading: false,
        error: error instanceof Error ? error.message : "MTS definition generation failed",
      });
    }
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

  function handleSaveProject() {
    if (!sections.length) {
      return false;
    }

    const defaultName = workspace.sourceFilename || "StormSurge Project";
    const name = window.prompt("Save project as", defaultName);
    if (name === null) {
      return false;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return false;
    }

    const snapshot = buildStudioSnapshot();
    setSavedProjects((current) => {
      const existing = current.find((project) => project.name === trimmedName);
      const nextProject = {
        id: existing?.id || `project-${Date.now()}`,
        name: trimmedName,
        savedAt: new Date().toISOString(),
        snapshot,
      };

      if (existing) {
        return current
          .map((project) => (project.id === existing.id ? nextProject : project))
          .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
      }

      return [nextProject, ...current].sort((left, right) =>
        right.savedAt.localeCompare(left.savedAt),
      );
    });
    return true;
  }

  function handleOpenSavedProject(project) {
    restoreStudioSnapshot(project.snapshot);
  }

  function handleGoHome() {
    if (!sections.length && !requirements.length) {
      resetToHomeScreen();
      return;
    }

    setHomeDialogOpen(true);
  }

  function handleConfirmHomeWithoutSaving() {
    setHomeDialogOpen(false);
    resetToHomeScreen();
  }

  function handleSaveThenGoHome() {
    const saved = handleSaveProject();
    if (!saved) {
      return;
    }

    setHomeDialogOpen(false);
    resetToHomeScreen();
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
          borderColor: "rgba(36, 50, 74, 0.95)",
          backdropFilter: "blur(16px)",
          bgcolor: "rgba(10, 15, 26, 0.92)",
          pl: 2,
          pr: 2,
          transition: "padding 180ms ease",
        }}
      >
        <Toolbar sx={{ gap: 2, minHeight: 76, pl: 0 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              StormSurge Studio
            </Typography>
          </Box>
          {!isHomeScreen ? (
            <>
              <Button variant="outlined" startIcon={<HomeRounded />} onClick={handleGoHome}>
                Home
              </Button>
              <Button
                variant="contained"
                startIcon={<SaveRounded />}
                onClick={handleSaveProject}
                disabled={!sections.length}
              >
                Save Project
              </Button>
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
            </>
          ) : null}
        </Toolbar>
      </AppBar>

      {!isHomeScreen ? (
        <RailShell
          side="left"
          title="Section Tabs"
          subtitle=""
          width={leftRailDisplayWidth}
          collapsed={leftRailCollapsed}
          onToggleCollapsed={() => setLeftRailCollapsed((current) => !current)}
          onResizeStart={startRailResize("left")}
        >
          {uploadState.error ? <Alert severity="error">{uploadState.error}</Alert> : null}

          <Box>
            <DndContext
              sensors={sectionTabSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleSectionTabDragEnd}
            >
              <SortableContext
                items={sections.map((section) => section.id)}
                strategy={verticalListSortingStrategy}
              >
                <List
                  sx={{
                    mt: 0.75,
                    p: 0,
                    bgcolor: "transparent",
                    border: 0,
                    boxShadow: "none",
                  }}
                >
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
                      sx={buildSectionBarSx(activeSectionId === "unassigned")}
                    >
                      <SectionTabContent
                        section={UNASSIGNED_SECTION}
                        selected={activeSectionId === "unassigned"}
                      />
                    </ListItemButton>
                  ) : null}
                </List>
              </SortableContext>
            </DndContext>
          </Box>
        </RailShell>
      ) : null}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          pl: isHomeScreen ? 0 : { xs: 0.375, md: 0.5, xl: 0.75 },
          pr: isHomeScreen ? 0 : { xs: 0.75, md: 1, xl: 1.25 },
          py: isHomeScreen ? 0 : 2,
          overflow: "hidden",
          overscrollBehavior: "contain",
          bgcolor: isHomeScreen ? "background.default" : "#171C24",
          borderLeft: isHomeScreen ? 0 : { xs: 0, xl: 1 },
          borderRight: isHomeScreen ? 0 : { xs: 0, xl: 1 },
          borderColor: "rgba(69, 87, 116, 0.98)",
        }}
      >
        <Toolbar sx={{ minHeight: 76 }} />
        <Box
          sx={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: isHomeScreen ? "hidden" : "auto",
            ...(isHomeScreen ? {} : subtleScrollbarSx),
            overscrollBehavior: "contain",
            px: isHomeScreen ? 3 : { xs: 0.5, xl: 1.25 },
            py: isHomeScreen ? 3 : 0.75,
            display: "flex",
            alignItems: isHomeScreen ? "center" : "stretch",
            justifyContent: isHomeScreen ? "center" : "flex-start",
          }}
        >
        <Stack spacing={3.25} sx={{ minHeight: "100%", width: "100%", maxWidth: isHomeScreen ? 980 : "none" }}>
          {uploadState.loading ? (
            <Paper variant="outlined" sx={{ p: 6, borderRadius: 0.75 }}>
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
            <Paper variant="outlined" sx={{ p: 6, borderRadius: 0.75, width: "100%" }}>
              <Stack spacing={3} alignItems="flex-start">
                <CloudUploadRounded color="primary" sx={{ fontSize: 40 }} />
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  Upload a PWS to start
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 720 }}>
                  Upload a PDF, DOCX, TXT, or Markdown PWS to build a new workspace,
                  or reopen one of your saved projects below.
                </Typography>
                <UploadWorkspaceCard loading={uploadState.loading} onUpload={handleOutlineUpload} />
                {savedProjects.length ? (
                  <Stack spacing={1.25} sx={{ width: "100%", maxWidth: 880 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      Saved Projects
                    </Typography>
                    {savedProjects.map((project) => (
                      <Paper
                        key={project.id}
                        variant="outlined"
                        sx={{
                          p: 1.5,
                          width: "100%",
                          borderRadius: 0.75,
                          bgcolor: "#15191F",
                          borderColor: "rgba(47, 64, 90, 0.72)",
                        }}
                      >
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={1.5}
                          alignItems={{ xs: "flex-start", sm: "center" }}
                          justifyContent="space-between"
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body1" sx={{ fontWeight: 600 }}>
                              {project.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Saved {new Date(project.savedAt).toLocaleString()}
                            </Typography>
                          </Box>
                          <Button variant="outlined" onClick={() => handleOpenSavedProject(project)}>
                            Open
                          </Button>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                ) : null}
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
        </Stack>
        </Box>
        {!isHomeScreen ? (
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
              notesByTab={activeSectionStormWorkspaceNotes}
              onNotesChange={handleStormWorkspaceNoteChange}
              onGenerateMtsDefinition={handleGenerateMtsDefinition}
              onClearActiveTab={handleClearStormWorkspaceTab}
              onEditMtsPrompt={handleEditMtsPrompt}
              generationState={mtsDefinitionGenerationState}
              activeSection={activeSection}
              activeSectionRequirementCount={activeSectionRequirements.length}
            />
          </Box>
        ) : null}
      </Box>

      {!isHomeScreen ? (
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
            allRequirements={requirements}
            sections={sections}
            hasCollapsibleRequirements={hasCollapsibleRequirements}
            onSelectRequirement={selectRequirement}
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
      ) : null}
      <Dialog
        open={mtsPromptDialogOpen}
        onClose={handleCloseMtsPromptDialog}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Edit MTS Definition Prompt</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={12}
            maxRows={24}
            margin="dense"
            value={mtsPromptDraft}
            onChange={(event) => setMtsPromptDraft(event.target.value)}
            placeholder="Enter the prompt used when generating the MTS Definition."
            InputProps={{
              sx: {
                alignItems: "flex-start",
                fontSize: "0.95rem",
                lineHeight: 1.5,
              },
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseMtsPromptDialog}>Cancel</Button>
          <Button onClick={handleSaveMtsPrompt} variant="contained">
            Save Prompt
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={homeDialogOpen} onClose={() => setHomeDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Return Home</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Do you want to save this project before going back to the home screen?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHomeDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmHomeWithoutSaving}>Go Home Without Saving</Button>
          <Button onClick={handleSaveThenGoHome} variant="contained">
            Save First
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
