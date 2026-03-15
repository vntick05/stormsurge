"use client";

import { useEffect, useMemo, useState } from "react";
import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import ExpandLessRounded from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import CloudUploadRounded from "@mui/icons-material/CloudUploadRounded";
import HomeRounded from "@mui/icons-material/HomeRounded";
import MoreVertRounded from "@mui/icons-material/MoreVertRounded";
import RedoRounded from "@mui/icons-material/RedoRounded";
import SaveRounded from "@mui/icons-material/SaveRounded";
import UndoRounded from "@mui/icons-material/UndoRounded";
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
  LinearProgress,
  List,
  ListItemButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import { DetailInspector } from "@/components/detail-inspector";
import { PackageProjectCard } from "@/components/package-project-card";
import { RequirementImportDialog } from "@/components/requirement-import-dialog";
import { UploadWorkspaceCard } from "@/components/upload-workspace-card";
import { WorkspaceCanvas } from "@/components/workspace-canvas";
import {
  createChildRequirement,
  createTopLevelRequirement,
  demoteRequirement,
  deleteRequirement,
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
const RAIL_COLLAPSED_WIDTH = 56;
const LEFT_RAIL_MIN_WIDTH = 240;
const RIGHT_RAIL_MIN_WIDTH = 64;
const LEFT_RAIL_MAX_WIDTH = 520;
const RIGHT_RAIL_MAX_WIDTH = 900;
const BOTTOM_DOCK_DEFAULT_HEIGHT = 340;
const BOTTOM_DOCK_MIN_HEIGHT = 220;
const BOTTOM_DOCK_MAX_HEIGHT = 520;
const STUDIO_STATE_STORAGE_KEY = "stormsurge-studio-state-v1";
const SAVED_PROJECTS_STORAGE_KEY = "stormsurge-studio-saved-projects-v1";
const UNDO_HISTORY_LIMIT = 5;
const STORM_WORKSPACE_TABS = [
  "MTS Definition",
  "MTS Solution",
  "Exceeds the Standard",
  "Risks",
];
const STORM_WORKSPACE_TAB_ACCENTS = {
  "MTS Definition": "#f78166",
  "MTS Solution": "#58a6ff",
  "Exceeds the Standard": "#3fb950",
  Risks: "#d29922",
};
const UNASSIGNED_SECTION = {
  id: "unassigned",
  label: "Unassigned Requirements",
  shortLabel: "UNAS",
  sourceKind: "system",
  sectionNumber: null,
};
const GITHUB_BASE = "#010409";
const GITHUB_SURFACE = "#0d1117";
const GITHUB_PANEL = "#161b22";
const GITHUB_PANEL_HOVER = "#1c2128";
const GITHUB_BORDER = "#30363d";
const GITHUB_BORDER_MUTED = "#21262d";
const GITHUB_TEXT_MUTED = "#7d8590";
const TOPBAR_BUTTON_SX = {
  height: 22,
  minHeight: 24,
  px: 0.9,
  py: 0,
  borderRadius: 1,
  fontSize: "0.71rem",
  lineHeight: 1,
  alignSelf: "center",
  "& .MuiButton-startIcon": {
    mr: 0.35,
    "& > *:nth-of-type(1)": {
      fontSize: 14,
    },
  },
};
const subtleScrollbarSx = {
  scrollbarWidth: "thin",
  scrollbarColor: "#30363d transparent",
  "&::-webkit-scrollbar": {
    width: 8,
    height: 8,
  },
  "&::-webkit-scrollbar-track": {
    background: "transparent",
  },
  "&::-webkit-scrollbar-thumb": {
    backgroundColor: "#30363d",
    borderRadius: 999,
    border: "2px solid transparent",
    backgroundClip: "padding-box",
  },
  "&:hover::-webkit-scrollbar-thumb": {
    backgroundColor: "#484f58",
  },
};

function clampRailWidth(width, minWidth, maxWidth) {
  return Math.min(Math.max(width, minWidth), maxWidth);
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
    alignItems: "center",
    borderRadius: 1,
    mb: 0.55,
    px: 1,
    py: 0.2,
    minHeight: 48,
    maxHeight: 48,
    bgcolor: selected ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.035)",
    border: "none",
    boxShadow: "none",
    transition: "background-color 120ms ease",
    "&:hover": {
      bgcolor: selected ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.06)",
      "& .section-tab-menu": {
        opacity: 1,
      },
    },
  };
}

function SectionTabContent({ section, selected, dragHandleProps, onOpenMenu }) {
  return (
    <>
      <Box
        {...dragHandleProps}
        onClick={(event) => event.stopPropagation()}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          alignSelf: "stretch",
          width: 22,
          flexShrink: 0,
          color: GITHUB_TEXT_MUTED,
          cursor: dragHandleProps ? "grab" : "default",
        }}
      >
        <MoreVertRounded sx={{ fontSize: 15 }} />
      </Box>
      <Stack direction="row" spacing={1.1} alignItems="center" sx={{ width: "100%" }}>
        <Box
          sx={{
            flexGrow: 1,
            minWidth: 0,
            minHeight: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            px: 0.4,
          }}
        >
          <Typography
            variant="body2"
            sx={{
              fontWeight: selected ? 600 : 500,
              fontSize: "0.88rem",
              lineHeight: 1.15,
              color: selected ? "#e6edf3" : GITHUB_TEXT_MUTED,
              textAlign: "left",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {section.label}
          </Typography>
        </Box>
        {onOpenMenu ? (
          <Tooltip title="Section actions">
            <IconButton
              className="section-tab-menu"
              size="small"
              edge="end"
              onClick={(event) => {
                event.stopPropagation();
                onOpenMenu(event.currentTarget, section.id);
              }}
              sx={{
                alignSelf: "center",
                color: GITHUB_TEXT_MUTED,
                opacity: selected ? 0.72 : 0,
                transition: "opacity 120ms ease",
                p: 0.35,
              }}
            >
              <MoreVertRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null}
      </Stack>
    </>
  );
}

function SortableSectionTab({ section, selected, onSelect, onRename, onOpenMenu }) {
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
        onOpenMenu={onOpenMenu}
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
  sx,
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
        borderRight: 0,
        borderLeft: 0,
        borderBottom: 0,
        borderColor: isLeft ? GITHUB_BORDER_MUTED : GITHUB_BORDER,
        bgcolor: GITHUB_BASE,
        backgroundImage: "none",
        boxShadow: "none",
        transition: "width 180ms ease",
        overflow: "hidden",
        overscrollBehavior: "contain",
        backdropFilter: "blur(10px)",
        borderRadius: 0,
        borderRight: isLeft ? "1px solid" : 0,
        borderLeft: !isLeft ? "1px solid" : 0,
        mt: { xs: 0, xl: 0 },
        mb: { xs: 0, xl: 0 },
        ml: { xs: 0, xl: isLeft ? 1.5 : 0 },
        mr: { xs: 0, xl: isLeft ? 0 : 1.5 },
        pt: 0,
        ...sx,
      }}
    >
      <Box
        sx={{
          px: isLeft ? 1.4 : 1.2,
          py: 0.9,
          display: "flex",
          justifyContent: isLeft ? "flex-end" : "flex-start",
          alignItems: "center",
          flexDirection: "row",
          flexShrink: 0,
          borderBottom: 0,
          background: "transparent",
          minHeight: collapsed ? 0 : 44,
          position: "relative",
          zIndex: 3,
        }}
      >
        {collapsed ? null : title ? (
          <Typography
            variant="subtitle1"
            sx={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "1rem",
              letterSpacing: -0.01,
              lineHeight: 1.1,
              textAlign: "center",
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </Typography>
        ) : null}
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
            px: 0.35,
            py: 0.6,
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
            sx={{
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              letterSpacing: 1.2,
              fontSize: "0.68rem",
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            {isLeft ? "Section Titles" : "REQ"}
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            p: isLeft ? 2 : 1.75,
            pt: 0.1,
            display: "flex",
            flexDirection: "column",
            gap: isLeft ? 0.1 : 1.25,
            overflowY: "auto",
            minHeight: 0,
            flex: "1 1 auto",
            ...subtleScrollbarSx,
            overscrollBehavior: "contain",
            background: "transparent",
          }}
        >
          {children}
        </Box>
      )}

      {!isLeft ? (
        <Box
          onMouseDown={onResizeStart}
          sx={{
            position: "absolute",
            top: 80,
            bottom: 0,
            left: -5,
            width: 10,
            cursor: "col-resize",
            zIndex: 10,
            display: { xs: "none", xl: "flex" },
            alignItems: "center",
            justifyContent: "center",
          }}
        />
      ) : null}
    </Box>
  );
}

function buildEmptyWorkspace() {
  return {
    sections: [],
    requirements: [],
    sourceFilename: null,
    sourceFormat: null,
    projectId: null,
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
    "Treat the checked requirements in this request as the full working requirement set for the response.",
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
    "Do not mention requirement counts, source expansion limits, hidden context, or that additional information could be retrieved later.",
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
  collapsed,
  onToggleCollapsed,
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
        borderRadius: { xs: 0.5, xl: 0 },
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        height: "100%",
        bgcolor: "#232327",
        bgcolor: GITHUB_SURFACE,
        backgroundImage: "none",
        boxShadow: { xs: "0 18px 32px rgba(0, 0, 0, 0.12)", xl: "none" },
        borderTop: 0,
        borderLeft: 0,
        borderRight: 0,
        borderBottom: 0,
        borderColor: GITHUB_BORDER,
      }}
    >
      <Box
        sx={{
          borderBottom: "1px solid",
          borderColor: GITHUB_BORDER,
          px: 1.35,
          py: 0.8,
          background: GITHUB_BASE,
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1}
          alignItems={{ xs: "stretch", md: "center" }}
          justifyContent="space-between"
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Section Solution
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{
              ml: { xs: 0, md: "auto" },
              width: { xs: "100%", md: "auto" },
              justifyContent: { xs: "space-between", md: "flex-end" },
            }}
          >
            {!collapsed ? (
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "stretch",
                  justifyContent: "flex-end",
                  flexWrap: "wrap",
                  gap: { xs: 1.6, md: 2.8 },
                  width: { xs: "100%", md: "auto" },
                  minWidth: 0,
                }}
              >
                {STORM_WORKSPACE_TABS.map((label) => {
                  const selected = activeTab === label;
                  const accentColor = STORM_WORKSPACE_TAB_ACCENTS[label] || "#f78166";
                  return (
                    <Button
                      key={label}
                      onClick={() => onTabChange(label)}
                      variant="text"
                      sx={{
                        position: "relative",
                        minHeight: 40,
                        px: 0.4,
                        borderRadius: 0,
                        color: selected ? "#e6edf3" : GITHUB_TEXT_MUTED,
                        bgcolor: "transparent",
                        border: 0,
                        boxShadow: "none",
                        fontSize: "0.94rem",
                        lineHeight: 1.05,
                        fontWeight: selected ? 600 : 500,
                        justifyContent: "center",
                        "&::after": {
                          content: '""',
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: -9,
                          height: 2,
                          bgcolor: selected ? accentColor : "transparent",
                          borderRadius: 999,
                        },
                        "&:hover": {
                          bgcolor: "transparent",
                          color: "#e6edf3",
                          "&::after": {
                            bgcolor: selected ? accentColor : "rgba(255, 255, 255, 0.2)",
                          },
                        },
                      }}
                    >
                      {label}
                    </Button>
                  );
                })}
              </Box>
            ) : null}
            <Tooltip title={collapsed ? "Expand Section Solution" : "Collapse Section Solution"}>
              <IconButton size="small" onClick={onToggleCollapsed}>
                {collapsed ? <ExpandLessRounded /> : <ExpandMoreRounded />}
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      </Box>
      {collapsed ? null : (
      <Box
        sx={{
          p: 2.5,
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          backgroundColor: GITHUB_SURFACE,
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
              {activeSection ? (
                <Typography variant="body2" color="text.secondary">
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
                bgcolor: GITHUB_PANEL,
                overscrollBehavior: "contain",
              },
            }}
          />
        </Stack>
      </Box>
      )}
    </Paper>
  );
}

export function StudioApp() {
  const [mounted, setMounted] = useState(false);
  const [workspace, setWorkspace] = useState(buildEmptyWorkspace);
  const [undoHistory, setUndoHistory] = useState([]);
  const [redoHistory, setRedoHistory] = useState([]);
  const [stormWorkspaceTab, setStormWorkspaceTab] = useState(STORM_WORKSPACE_TABS[0]);
  const [stormWorkspaceNotes, setStormWorkspaceNotes] = useState({});
  const [stormWorkspacePrompts, setStormWorkspacePrompts] = useState({});
  const [savedProjects, setSavedProjects] = useState([]);
  const [availablePackageProjects, setAvailablePackageProjects] = useState([]);
  const [selectedPackageProjectId, setSelectedPackageProjectId] = useState("");
  const [projectSetupState, setProjectSetupState] = useState({
    loading: false,
    error: "",
    jobId: "",
    message: "",
  });
  const [projectSetupProgress, setProjectSetupProgress] = useState(0);
  const [mtsPromptDialogOpen, setMtsPromptDialogOpen] = useState(false);
  const [mtsPromptDraft, setMtsPromptDraft] = useState("");
  const [homeDialogOpen, setHomeDialogOpen] = useState(false);
  const [stormWorkspaceHeight, setStormWorkspaceHeight] = useState(BOTTOM_DOCK_DEFAULT_HEIGHT);
  const [stormWorkspaceCollapsed, setStormWorkspaceCollapsed] = useState(false);
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
  const [sectionMenuAnchorEl, setSectionMenuAnchorEl] = useState(null);
  const [sectionMenuSectionId, setSectionMenuSectionId] = useState("");
  const [reqImportDialogOpen, setReqImportDialogOpen] = useState(false);
  const [reqImportWorkspace, setReqImportWorkspace] = useState(buildEmptyWorkspace);
  const [reqImportSectionId, setReqImportSectionId] = useState("");
  const [reqImportCheckedIds, setReqImportCheckedIds] = useState(() => new Set());
  const [reqImportState, setReqImportState] = useState({
    loading: false,
    error: "",
  });

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
    setUndoHistory([]);
    setRedoHistory([]);
    setStormWorkspaceTab(STORM_WORKSPACE_TABS[0]);
    setStormWorkspaceNotes({});
    setStormWorkspacePrompts({});
    setActiveSectionId("");
    setSelectedRequirementId("");
    setStormWorkspaceCollapsed(false);
    setCollapsedRequirementIds(new Set());
    setUploadState({ loading: false, error: "" });
    setSelectedPackageProjectId("");
    setProjectSetupState({ loading: false, error: "", jobId: "", message: "" });
    setProjectSetupProgress(0);
    setMtsDefinitionGenerationState({ loading: false, error: "" });
  }

  function restoreStudioSnapshot(snapshot) {
    setWorkspace(snapshot?.workspace ? snapshot.workspace : buildEmptyWorkspace());
    setUndoHistory([]);
    setRedoHistory([]);
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
    setStormWorkspaceCollapsed(false);
    setLeftRailWidth(
        typeof snapshot?.leftRailWidth === "number"
        ? clampRailWidth(snapshot.leftRailWidth, LEFT_RAIL_MIN_WIDTH, LEFT_RAIL_MAX_WIDTH)
        : LEFT_RAIL_DEFAULT_WIDTH,
    );
    setRightRailWidth(
      typeof snapshot?.rightRailWidth === "number"
        ? clampRailWidth(snapshot.rightRailWidth, RIGHT_RAIL_MIN_WIDTH, RIGHT_RAIL_MAX_WIDTH)
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
    setSelectedPackageProjectId(
      typeof snapshot?.workspace?.projectId === "string" ? snapshot.workspace.projectId : "",
    );
    setProjectSetupState({ loading: false, error: "", jobId: "", message: "" });
    setProjectSetupProgress(0);
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
    let ignore = false;

    async function loadAvailableProjects() {
      try {
        const response = await fetch("/api/storm/active-projects", {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({ projects: [] }));
        if (!response.ok || ignore) {
          return;
        }
        setAvailablePackageProjects(Array.isArray(payload?.projects) ? payload.projects : []);
      } catch {
        if (!ignore) {
          setAvailablePackageProjects([]);
        }
      }
    }

    loadAvailableProjects();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!projectSetupState.loading || !projectSetupState.jobId) {
      return undefined;
    }

    let cancelled = false;

    async function pollJobStatus() {
      try {
        const response = await fetch(
          `/api/storm/package-project/status?jobId=${encodeURIComponent(projectSetupState.jobId)}`,
          { cache: "no-store" },
        );
        const payload = await response.json().catch(() => null);

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          throw new Error(payload?.detail || "Project setup status failed");
        }

        setProjectSetupProgress(Number(payload?.progress) || 0);
        setProjectSetupState((current) => ({
          ...current,
          message: String(payload?.message || "").trim(),
        }));

        if (!payload?.done) {
          return;
        }

        if (payload?.stage === "completed") {
          const nextProject = {
            project_id: payload?.projectId,
            display_name: payload?.displayName || payload?.projectId,
          };

          setAvailablePackageProjects((current) => {
            const remaining = current.filter(
              (project) => String(project?.project_id || "").trim() !== nextProject.project_id,
            );
            return [nextProject, ...remaining];
          });
          setSelectedPackageProjectId(nextProject.project_id || "");
          setProjectSetupProgress(100);
          setProjectSetupState({
            loading: false,
            error: "",
            jobId: "",
            message: "Package project is ready",
          });
          return;
        }

        throw new Error(payload?.error || "Project setup failed");
      } catch (error) {
        if (!cancelled) {
          setProjectSetupState({
            loading: false,
            error: error instanceof Error ? error.message : "Project setup failed",
            jobId: "",
            message: "",
          });
        }
      }
    }

    void pollJobStatus();
    const intervalId = window.setInterval(() => {
      void pollJobStatus();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [projectSetupState.loading, projectSetupState.jobId]);

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
          setLeftRailWidth(
            clampRailWidth(moveEvent.clientX, LEFT_RAIL_MIN_WIDTH, LEFT_RAIL_MAX_WIDTH),
          );
          return;
        }

        setRightRailCollapsed(false);
        setRightRailWidth(
          clampRailWidth(
            window.innerWidth - moveEvent.clientX,
            RIGHT_RAIL_MIN_WIDTH,
            RIGHT_RAIL_MAX_WIDTH,
          ),
        );
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

    applyWorkspaceChange((current) => ({
      ...current,
      requirements: current.requirements.map((requirement) =>
        requirement.id === selectedRequirement.id
          ? updater(requirement)
          : requirement,
      ),
    }));
  }

  function pushHistorySnapshot(setHistory, snapshot) {
    setHistory((current) => [snapshot, ...current].slice(0, UNDO_HISTORY_LIMIT));
  }

  function applyWorkspaceChange(updateWorkspace, options = {}) {
    const nextWorkspace =
      typeof updateWorkspace === "function" ? updateWorkspace(workspace) : updateWorkspace;

    const workspaceChanged =
      nextWorkspace !== workspace &&
      (nextWorkspace.sections !== workspace.sections ||
        nextWorkspace.requirements !== workspace.requirements ||
        nextWorkspace.sourceFilename !== workspace.sourceFilename ||
        nextWorkspace.sourceFormat !== workspace.sourceFormat);

    if (!workspaceChanged) {
      return;
    }

    pushHistorySnapshot(setUndoHistory, {
      workspace,
      activeSectionId,
      selectedRequirementId,
    });
    setRedoHistory([]);
    setWorkspace(nextWorkspace);

    if (Object.prototype.hasOwnProperty.call(options, "nextActiveSectionId")) {
      setActiveSectionId(options.nextActiveSectionId || "");
    }

    if (Object.prototype.hasOwnProperty.call(options, "nextSelectedRequirementId")) {
      setSelectedRequirementId(options.nextSelectedRequirementId || "");
    }
  }

  function handleUndo() {
    if (!undoHistory.length) {
      return;
    }

    const [latestSnapshot, ...remainingHistory] = undoHistory;
    setUndoHistory(remainingHistory);
    pushHistorySnapshot(setRedoHistory, {
      workspace,
      activeSectionId,
      selectedRequirementId,
    });
    setWorkspace(latestSnapshot.workspace);
    setActiveSectionId(latestSnapshot.activeSectionId || "");
    setSelectedRequirementId(latestSnapshot.selectedRequirementId || "");
    setCollapsedRequirementIds(new Set());
  }

  function handleRedo() {
    if (!redoHistory.length) {
      return;
    }

    const [latestSnapshot, ...remainingHistory] = redoHistory;
    setRedoHistory(remainingHistory);
    pushHistorySnapshot(setUndoHistory, {
      workspace,
      activeSectionId,
      selectedRequirementId,
    });
    setWorkspace(latestSnapshot.workspace);
    setActiveSectionId(latestSnapshot.activeSectionId || "");
    setSelectedRequirementId(latestSnapshot.selectedRequirementId || "");
    setCollapsedRequirementIds(new Set());
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
    applyWorkspaceChange((current) => {
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
    }, { nextSelectedRequirementId: insertedRequirement.id });
  }

  function handleCreateChildRequirement() {
    if (!selectedRequirement || selectedRequirement.sectionId === "unassigned") {
      return;
    }

    const nextRequirement = createChildRequirement(selectedRequirement, requirements);
    applyWorkspaceChange((current) => ({
      ...current,
      requirements: [...current.requirements, nextRequirement],
    }), { nextSelectedRequirementId: nextRequirement.id });
  }

  function handleAssignToActiveSection() {
    if (!selectedRequirement || !activeSection) {
      return;
    }

    applyWorkspaceChange((current) => ({
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

    applyWorkspaceChange((current) => ({
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

    applyWorkspaceChange((current) => ({
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

    applyWorkspaceChange((current) => ({
      ...current,
      requirements: promoteRequirement(current.requirements, selectedRequirement.id),
    }));
  }

  function handleDemoteRequirement() {
    if (!selectedRequirement) {
      return;
    }

    applyWorkspaceChange((current) => ({
      ...current,
      requirements: demoteRequirement(current.requirements, selectedRequirement.id),
    }));
  }

  function handleDeleteRequirement() {
    if (!selectedRequirement) {
      return;
    }

    const requirementId = selectedRequirement.id;
    const fallbackSectionId = activeSection?.id || selectedRequirement.sectionId;
    const remainingRequirements = deleteRequirement(requirements, requirementId);
    const fallbackRequirement = fallbackSectionId
      ? getSectionRoots(remainingRequirements, fallbackSectionId)[0]
      : null;

    applyWorkspaceChange((current) => ({
      ...current,
      requirements: deleteRequirement(current.requirements, requirementId),
    }), { nextSelectedRequirementId: fallbackRequirement?.id ?? "" });
  }

  function handleReorderRequirements(nextRequirements) {
    applyWorkspaceChange((current) => ({
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

    applyWorkspaceChange((current) => ({
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

    applyWorkspaceChange((current) => ({
      ...current,
      sections: [...current.sections, nextSection],
      requirements: reassignRequirement(
        current.requirements,
        selectedRequirement.id,
        nextSection.id,
      ),
    }), {
      nextActiveSectionId: nextSection.id,
      nextSelectedRequirementId: selectedRequirement.id,
    });
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

    applyWorkspaceChange((current) => ({
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

  function handleOpenSectionMenu(anchorEl, sectionId) {
    setSectionMenuAnchorEl(anchorEl);
    setSectionMenuSectionId(sectionId);
  }

  function handleCloseSectionMenu() {
    setSectionMenuAnchorEl(null);
    setSectionMenuSectionId("");
  }

  function handleOpenReqImportDialog() {
    setReqImportDialogOpen(true);
    setReqImportState({ loading: false, error: "" });
  }

  function handleCloseReqImportDialog() {
    setReqImportDialogOpen(false);
    setReqImportState({ loading: false, error: "" });
    setReqImportWorkspace(buildEmptyWorkspace());
    setReqImportSectionId("");
    setReqImportCheckedIds(new Set());
  }

  if (!mounted) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          bgcolor: GITHUB_SURFACE,
        }}
      >
        <CircularProgress size={28} />
      </Box>
    );
  }

  async function handleReqImportUpload(file) {
    setReqImportState({ loading: true, error: "" });

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/pws/outline-upload", {
        method: "POST",
        body,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "PWS import failed");
      }

      const payload = await response.json();
      const nextWorkspace = transformOutlineToWorkspace(payload);
      setReqImportWorkspace(nextWorkspace);
      setReqImportSectionId(nextWorkspace.sections[0]?.id || "");
      setReqImportCheckedIds(new Set());
      setReqImportState({ loading: false, error: "" });
    } catch (error) {
      setReqImportState({
        loading: false,
        error: error instanceof Error ? error.message : "PWS import failed",
      });
    }
  }

  function handleToggleReqImportChecked(requirementId) {
    setReqImportCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(requirementId)) {
        next.delete(requirementId);
      } else {
        next.add(requirementId);
      }
      return next;
    });
  }

  function handleImportSelectedRequirements() {
    if ((!selectedRequirement && !activeSection) || !reqImportCheckedIds.size) {
      return;
    }

    const sourceRequirements = reqImportWorkspace.requirements;
    const selectedRoots = sourceRequirements
      .filter((requirement) => reqImportCheckedIds.has(requirement.id))
      .filter((requirement) => {
        let parentId = requirement.parentId;
        while (parentId) {
          if (reqImportCheckedIds.has(parentId)) {
            return false;
          }
          parentId = getRequirementById(sourceRequirements, parentId)?.parentId || null;
        }
        return true;
      });

    if (!selectedRoots.length) {
      return;
    }

    let idCounter = Date.now();
    applyWorkspaceChange((current) => {
      const targetRequirement = selectedRequirement
        ? getRequirementById(current.requirements, selectedRequirement.id)
        : null;
      const targetSectionId = targetRequirement?.sectionId || activeSection?.id;
      if (!targetSectionId || targetSectionId === "unassigned") {
        return current;
      }

      const existingSiblings = targetRequirement
        ? getChildren(current.requirements, targetRequirement.id)
        : getSectionRoots(current.requirements, targetSectionId);
      const insertedRequirements = [];

      function cloneSubtree(sourceRequirement, parentId, position) {
        const cloneId = `import-${idCounter++}`;
        const clone = {
          ...sourceRequirement,
          id: cloneId,
          sectionId: targetSectionId,
          parentId,
          position,
          sourceType: "imported",
          kind: parentId ? "child" : "top-level",
          summary:
            sourceRequirement.summary ||
            String(sourceRequirement.text || "").replace(/\s+/g, " ").trim().slice(0, 160),
        };
        insertedRequirements.push(clone);

        getChildren(sourceRequirements, sourceRequirement.id).forEach((child, index) => {
          cloneSubtree(child, cloneId, index + 1);
        });
      }

      selectedRoots.forEach((rootRequirement, index) => {
        cloneSubtree(
          rootRequirement,
          targetRequirement?.id || null,
          existingSiblings.length + index + 1,
        );
      });

      return {
        ...current,
        requirements: [...current.requirements, ...insertedRequirements],
      };
    });

    handleCloseReqImportDialog();
  }

  function handleRenameSectionFromMenu() {
    if (!sectionMenuSectionId) {
      return;
    }

    const sectionId = sectionMenuSectionId;
    handleCloseSectionMenu();
    handleRenameSection(sectionId);
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
      if (selectedPackageProjectId) {
        body.append("projectId", selectedPackageProjectId);
      }

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
      setSelectedPackageProjectId(nextWorkspace.projectId || selectedPackageProjectId);
      setUndoHistory([]);
      setRedoHistory([]);
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

  async function handleCreatePackageProject({ projectName, files }) {
    setProjectSetupState({
      loading: true,
      error: "",
      jobId: "",
      message: "Starting package job",
    });
    setProjectSetupProgress(2);

    try {
      const body = new FormData();
      body.append("projectName", projectName);
      files.forEach((file) => body.append("files", file, file.name));

      const response = await fetch("/api/storm/package-project/start", {
        method: "POST",
        body,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.detail || "Project setup failed");
      }

      setProjectSetupProgress(Number(payload?.progress) || 2);
      setProjectSetupState({
        loading: true,
        error: "",
        jobId: String(payload?.jobId || ""),
        message: String(payload?.message || "").trim() || "Uploading files",
      });
      return true;
    } catch (error) {
      setProjectSetupState({
        loading: false,
        error: error instanceof Error ? error.message : "Project setup failed",
        jobId: "",
        message: "",
      });
      return false;
    }
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
        flexDirection: "column",
        height: "100vh",
        bgcolor: "background.default",
        overflow: "hidden",
        gap: 0,
        px: 0,
      }}
    >
      <AppBar
        position="relative"
        color="transparent"
        elevation={0}
        sx={{
          display: "flex",
          left: 0,
          right: 0,
          borderBottom: "1px solid rgba(255, 255, 255, 0.22)",
          backdropFilter: "none",
          bgcolor: "#000000",
          pl: { xs: 0.9, xl: 1.2 },
          pr: { xs: 0.45, xl: 0.6 },
          py: 0,
          transition: "padding 180ms ease",
          boxShadow: "none",
          flexShrink: 0,
        }}
      >
        <Toolbar
          disableGutters
          sx={{
            minHeight: "34px !important",
            height: 34,
            py: 0,
            pl: 0,
            pr: 0,
          }}
        >
          <Box sx={{ flexGrow: 1 }}>
            <Typography
              variant="h5"
              sx={{
                color: "#ffffff",
                fontWeight: 700,
                letterSpacing: -0.03,
                lineHeight: 1,
                fontSize: "1.08rem",
              }}
            >
              StormSurge
            </Typography>
          </Box>
          {!isHomeScreen ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                height: 34,
                gap: 0.85,
                ml: "auto",
              }}
            >
              <Button
                variant="outlined"
                startIcon={<UndoRounded />}
                onClick={handleUndo}
                disabled={!undoHistory.length}
                sx={TOPBAR_BUTTON_SX}
              >
                Undo
              </Button>
              <Button
                variant="outlined"
                startIcon={<RedoRounded />}
                onClick={handleRedo}
                disabled={!redoHistory.length}
                sx={TOPBAR_BUTTON_SX}
              >
                Redo
              </Button>
              <Button
                variant="contained"
                startIcon={<SaveRounded />}
                onClick={handleSaveProject}
                disabled={!sections.length}
                sx={TOPBAR_BUTTON_SX}
              >
                Save Project
              </Button>
              <Button
                variant="outlined"
                startIcon={<HomeRounded />}
                onClick={handleGoHome}
                sx={TOPBAR_BUTTON_SX}
              >
                Home
              </Button>
            </Box>
          ) : null}
        </Toolbar>
      </AppBar>

      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          flex: "1 1 auto",
          minHeight: 0,
          overflow: "hidden",
          "@media (max-width: 1600px)": {
            flexDirection: "column",
          },
        }}
      >
        {!isHomeScreen ? (
          <RailShell
            side="left"
            title="Section Titles"
            subtitle=""
            width={leftRailDisplayWidth}
            collapsed={leftRailCollapsed}
            onToggleCollapsed={() => setLeftRailCollapsed((current) => !current)}
            onResizeStart={startRailResize("left")}
            sx={{
              order: 1,
              "@media (max-width: 1600px)": {
                display: "none",
              },
            }}
          >
            {uploadState.error ? <Alert severity="error">{uploadState.error}</Alert> : null}

            <Box sx={{ flex: "1 1 auto", minHeight: 0 }}>
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
                      mt: 0.2,
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
                        onOpenMenu={handleOpenSectionMenu}
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
            <Stack spacing={1.1} sx={{ pt: 1.25, mt: "auto" }}>
              <Button
                variant="outlined"
                onClick={handleOpenReqImportDialog}
                sx={{
                  justifyContent: "flex-start",
                  borderColor: GITHUB_BORDER,
                  color: "#e6edf3",
                  textTransform: "none",
                }}
              >
                Import Reqs
              </Button>
              <Button
                variant="outlined"
                onClick={handleCreateSectionFromRequirement}
                sx={{
                  justifyContent: "flex-start",
                  borderColor: GITHUB_BORDER,
                  color: "#e6edf3",
                  textTransform: "none",
                }}
              >
                New Section From Req
              </Button>
            </Stack>
          </RailShell>
        ) : null}

        <Box
          component="main"
          sx={{
            order: 2,
            flexGrow: 1,
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            pl: 0,
            pr: 0,
            py: isHomeScreen ? 0 : { xs: 0, xl: 0 },
            overflow: "hidden",
            overscrollBehavior: "contain",
            bgcolor: GITHUB_SURFACE,
            borderLeft: 0,
            borderRight: 0,
            borderColor: GITHUB_BORDER,
            "@media (max-width: 1600px)": {
              order: 1,
            },
          }}
        >
        <Box
          sx={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: isHomeScreen ? "hidden" : "auto",
            ...(isHomeScreen ? {} : subtleScrollbarSx),
            overscrollBehavior: "contain",
            px: isHomeScreen ? 3 : { xs: 0.75, xl: 0.9 },
            py: isHomeScreen ? 3 : { xs: 0.5, xl: 0.35 },
            display: "flex",
            alignItems: isHomeScreen ? "center" : "stretch",
            justifyContent: isHomeScreen ? "center" : "flex-start",
            bgcolor: isHomeScreen ? "transparent" : GITHUB_SURFACE,
          }}
        >
          <Stack
            spacing={3.25}
            sx={{
              minHeight: "100%",
              width: "100%",
              maxWidth: isHomeScreen ? 980 : "none",
            }}
          >
            {uploadState.loading ? (
              <Paper
                variant="outlined"
                sx={{
                  p: 6,
                  borderRadius: 1,
                  borderColor: GITHUB_BORDER,
                  bgcolor: GITHUB_PANEL,
                  backgroundImage:
                    "linear-gradient(180deg, rgba(47,129,247,0.08) 0%, rgba(13,17,23,0) 22%)",
                }}
              >
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
              <Paper
                variant="outlined"
                sx={{
                  p: 6,
                  borderRadius: 1,
                  width: "100%",
                  borderColor: GITHUB_BORDER,
                  bgcolor: GITHUB_PANEL,
                  backgroundImage:
                    "linear-gradient(180deg, rgba(47,129,247,0.12) 0%, rgba(13,17,23,0) 18%)",
                }}
              >
                <Stack spacing={3} alignItems="flex-start">
                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: 2,
                      display: "grid",
                      placeItems: "center",
                      bgcolor: GITHUB_SURFACE,
                      border: `1px solid ${GITHUB_BORDER}`,
                    }}
                  >
                    <CloudUploadRounded color="primary" sx={{ fontSize: 30 }} />
                  </Box>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  Start a workspace or build a package project
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 780 }}>
                  Create a package project first if you want search and AI tools to use the full
                  document set, then upload the PWS and attach that workspace to the project.
                </Typography>
                <Stack
                  direction={{ xs: "column", xl: "row" }}
                  spacing={2}
                  sx={{ width: "100%", maxWidth: 980, alignItems: "stretch" }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <PackageProjectCard
                      loading={projectSetupState.loading}
                      onCreateProject={handleCreatePackageProject}
                    />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <UploadWorkspaceCard
                      loading={uploadState.loading}
                      onUpload={handleOutlineUpload}
                      projects={availablePackageProjects}
                      selectedProjectId={selectedPackageProjectId}
                      onProjectChange={setSelectedPackageProjectId}
                    />
                  </Box>
                </Stack>
                {projectSetupState.error ? (
                  <Alert severity="error" sx={{ width: "100%", maxWidth: 980 }}>
                    {projectSetupState.error}
                  </Alert>
                ) : null}
                {projectSetupState.loading ? (
                  <Alert severity="info" sx={{ width: "100%", maxWidth: 980 }}>
                    {projectSetupState.message || "Running package ingest pipeline"}
                  </Alert>
                ) : null}
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
                          borderRadius: 1,
                          bgcolor: GITHUB_PANEL,
                          borderColor: GITHUB_BORDER,
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
              <Box
                sx={{
                  flex: "1 1 auto",
                  minWidth: 0,
                  borderRadius: 1,
                  bgcolor: GITHUB_SURFACE,
                }}
              >
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
              height: stormWorkspaceCollapsed ? 58 : stormWorkspaceHeight,
              position: "relative",
            }}
          >
            {stormWorkspaceCollapsed ? null : (
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
                    bgcolor: GITHUB_BORDER,
                  },
                  "&:hover::before": {
                    bgcolor: "#8b949e",
                  },
                }}
              />
            )}
            <StormWorkspaceBar
              collapsed={stormWorkspaceCollapsed}
              onToggleCollapsed={() => setStormWorkspaceCollapsed((current) => !current)}
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
            title="Requirement Tools"
            subtitle=""
            width={rightRailDisplayWidth}
            collapsed={rightRailCollapsed}
            onToggleCollapsed={() => setRightRailCollapsed((current) => !current)}
            onResizeStart={startRailResize("right")}
            sx={{
              order: 3,
              "@media (max-width: 1600px)": {
                display: "none",
              },
            }}
          >
            <DetailInspector
              projectId={workspace.projectId}
              section={activeSection}
              requirement={selectedRequirement}
              sectionRequirements={activeSectionRequirements}
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
              onDeleteRequirement={handleDeleteRequirement}
            />
          </RailShell>
        ) : null}
      </Box>
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
      <Menu
        anchorEl={sectionMenuAnchorEl}
        open={Boolean(sectionMenuAnchorEl)}
        onClose={handleCloseSectionMenu}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        PaperProps={{
          sx: {
            bgcolor: "#232327",
            border: `1px solid ${GITHUB_BORDER}`,
            borderRadius: 2,
            minWidth: 160,
            boxShadow: "0 16px 36px rgba(0, 0, 0, 0.32)",
          },
        }}
      >
        <MenuItem onClick={handleRenameSectionFromMenu}>Rename</MenuItem>
      </Menu>
      <RequirementImportDialog
        open={reqImportDialogOpen}
        targetRequirement={selectedRequirement}
        sourceWorkspace={reqImportWorkspace}
        activeSectionId={reqImportSectionId}
        checkedIds={reqImportCheckedIds}
        loading={reqImportState.loading}
        error={reqImportState.error}
        onClose={handleCloseReqImportDialog}
        onUpload={handleReqImportUpload}
        onSelectSection={setReqImportSectionId}
        onToggleChecked={handleToggleReqImportChecked}
        onImport={handleImportSelectedRequirements}
      />
      {projectSetupState.loading ? (
        <Paper
          elevation={8}
          sx={{
            position: "fixed",
            left: 20,
            right: 20,
            bottom: 20,
            zIndex: 1600,
            px: 2,
            py: 1.5,
            bgcolor: GITHUB_PANEL,
            border: `1px solid ${GITHUB_BORDER}`,
            borderRadius: 1,
          }}
        >
          <Stack spacing={1}>
            <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
              <Typography variant="body2" sx={{ fontWeight: 600, color: "#e6edf3" }}>
                {projectSetupState.message || "Running package ingest pipeline"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {projectSetupProgress}%
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={projectSetupProgress}
              sx={{
                height: 8,
                borderRadius: 999,
                bgcolor: "rgba(255, 255, 255, 0.08)",
              }}
            />
          </Stack>
        </Paper>
      ) : null}
    </Box>
  );
}
