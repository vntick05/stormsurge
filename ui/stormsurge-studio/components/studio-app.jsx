"use client";

import { useEffect, useMemo, useState } from "react";
import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import ExpandLessRounded from "@mui/icons-material/ExpandLessRounded";
import CloudUploadRounded from "@mui/icons-material/CloudUploadRounded";
import DarkModeRounded from "@mui/icons-material/DarkModeRounded";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import HomeRounded from "@mui/icons-material/HomeRounded";
import LightModeRounded from "@mui/icons-material/LightModeRounded";
import MoreVertRounded from "@mui/icons-material/MoreVertRounded";
import AssignmentTurnedInRounded from "@mui/icons-material/AssignmentTurnedInRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import PlaylistAddRounded from "@mui/icons-material/PlaylistAddRounded";
import RedoRounded from "@mui/icons-material/RedoRounded";
import SaveRounded from "@mui/icons-material/SaveRounded";
import TrackChangesRounded from "@mui/icons-material/TrackChangesRounded";
import UndoRounded from "@mui/icons-material/UndoRounded";
import TrendingUpRounded from "@mui/icons-material/TrendingUpRounded";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
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
  useTheme,
} from "@mui/material";
import { useStudioThemeMode } from "@/app/theme-registry";
import { DetailInspector } from "@/components/detail-inspector";
import { PackageProjectCard } from "@/components/package-project-card";
import { RequirementImportDialog } from "@/components/requirement-import-dialog";
import { RichTextEditor } from "@/components/rich-text-editor";
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
const STUDIO_STATE_STORAGE_KEY = "stormsurge-studio-state-v1";
const SAVED_PROJECTS_STORAGE_KEY = "stormsurge-studio-saved-projects-v1";
const AUTOSAVE_PROJECT_ID = "autosave-current-workspace";
const AUTOSAVE_PROJECT_NAME = "Autosave";
const AUTOSAVE_DELAY_MS = 1500;
const UNDO_HISTORY_LIMIT = 5;
const STORM_WORKSPACE_TABS = [
  "MTS Definition",
  "MTS Solution",
  "Exceeds MTS",
  "Risks",
];
const STORM_WORKSPACE_TAB_ACCENTS = {
  "MTS Definition": "#58a6ff",
  "MTS Solution": "#f78166",
  "Exceeds MTS": "#3fb950",
  Risks: "#d29922",
};
const STORM_WORKSPACE_TAB_ICONS = {
  "MTS Definition": TrackChangesRounded,
  "MTS Solution": AssignmentTurnedInRounded,
  "Exceeds MTS": TrendingUpRounded,
  Risks: WarningAmberRounded,
};
const MTS_DEFINITION_PANELS = [
  { id: "definition_1", label: "Dependencies" },
  { id: "definition_2", label: "MTS Definition" },
];
const STORM_WORKSPACE_TAB_TEXT_COLORS = {
  "MTS Definition": null,
  "MTS Solution": "#3fb950",
  "Exceeds MTS": "#58a6ff",
  Risks: "#f85149",
};
const UNASSIGNED_SECTION = {
  id: "unassigned",
  label: "Unassigned Requirements",
  shortLabel: "UNAS",
  sourceKind: "system",
  sectionNumber: null,
};
const GITHUB_BASE = "var(--studio-base)";
const GITHUB_SURFACE = "var(--studio-surface)";
const GITHUB_PANEL = "var(--studio-panel)";
const GITHUB_PANEL_HOVER = "var(--studio-panel-hover)";
const GITHUB_BORDER = "var(--studio-border)";
const GITHUB_BORDER_MUTED = "var(--studio-border-muted)";
const GITHUB_TEXT_MUTED = "var(--studio-text-muted)";
const GITHUB_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
const AI_ACTION = "var(--studio-ai-action)";
const CHROME_BG = "var(--studio-chrome-bg)";
const CHROME_BG_SOFT = "var(--studio-chrome-bg-soft)";
const CHROME_TEXT = "var(--studio-chrome-text)";
const CHROME_TEXT_MUTED = "var(--studio-chrome-text)";
const CHROME_BORDER = "var(--studio-chrome-border)";
const LIGHT_SHARED_SURFACE = "#f7f9fb";
const LIGHT_SHARED_SURFACE_HOVER = "#f0f4f8";
const LIGHT_CANVAS_SURFACE = "#e1e6ec";
const RIBBON_TOOL_BUTTON_SX = {
  minWidth: 0,
  height: 28,
  px: 0.85,
  py: 0.25,
  borderRadius: 0.9,
  border: "1px solid transparent",
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 0.15,
  textTransform: "none",
  lineHeight: 1,
  fontSize: "0.73rem",
  fontWeight: 600,
  color: CHROME_TEXT,
  bgcolor: "transparent",
  boxShadow: "none",
  "& .MuiButton-startIcon": {
    mr: 0.45,
    ml: 0,
  },
  "& .MuiSvgIcon-root": {
    fontSize: 14,
  },
  "&:hover": {
    bgcolor: CHROME_BG_SOFT,
    borderColor: CHROME_BORDER,
    boxShadow: "none",
  },
};
const subtleScrollbarSx = {
  scrollbarWidth: "thin",
  scrollbarColor: "var(--studio-scrollbar) transparent",
  "&::-webkit-scrollbar": {
    width: 8,
    height: 8,
  },
  "&::-webkit-scrollbar-track": {
    background: "transparent",
  },
  "&::-webkit-scrollbar-thumb": {
    backgroundColor: "var(--studio-scrollbar)",
    borderRadius: 999,
    border: "2px solid transparent",
    backgroundClip: "padding-box",
  },
  "&:hover::-webkit-scrollbar-thumb": {
    backgroundColor: "var(--studio-text-muted)",
  },
};

function clampRailWidth(width, minWidth, maxWidth) {
  return Math.min(Math.max(width, minWidth), maxWidth);
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
    width: "calc(100% - 10px)",
    mx: "auto",
    borderRadius: 1,
    mb: 0.8,
    px: 0.75,
    py: 0.08,
    minHeight: 38,
    maxHeight: 38,
    bgcolor: selected ? "rgba(255,255,255,0.12)" : "transparent",
    border: "none",
    boxShadow: "none",
    transition: "background-color 120ms ease",
    "&:hover": {
      bgcolor: selected ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)",
      "& .section-tab-menu": {
        opacity: 1,
      },
    },
  };
}

function SectionTabContent({ section, selected, dragHandleProps, onOpenMenu, completed }) {
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
          width: 24,
          height: 24,
          my: "auto",
          flexShrink: 0,
          color: CHROME_TEXT_MUTED,
          cursor: dragHandleProps ? "grab" : "default",
          borderRadius: 0.9,
          bgcolor: "transparent",
        }}
      >
        <MoreVertRounded sx={{ fontSize: 15 }} />
      </Box>
      <Stack
        direction="row"
        spacing={0.7}
        alignItems="center"
        sx={{ width: "100%", minWidth: 0, flexWrap: "nowrap" }}
      >
        <Box
          sx={{
            flex: "1 1 auto",
            minWidth: 0,
            maxWidth: "calc(100% - 28px)",
            minHeight: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            pl: 0.5,
            pr: 0.25,
            overflow: "hidden",
          }}
        >
          <Typography
            variant="body2"
            sx={{
              fontWeight: selected ? 500 : 400,
              fontSize: "0.88rem",
              lineHeight: 1.15,
              color: selected ? CHROME_TEXT : CHROME_TEXT_MUTED,
              textAlign: "left",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              width: "100%",
            }}
          >
            {section.label}
          </Typography>
        </Box>
        {completed ? (
          <CheckCircleRounded
            sx={{
              flexShrink: 0,
              fontSize: 16,
              color: "#3fb950",
            }}
          />
        ) : null}
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
                flexShrink: 0,
                color: CHROME_TEXT_MUTED,
                opacity: selected ? 0.72 : 0,
                transition: "opacity 120ms ease",
                width: 24,
                height: 24,
                p: 0.25,
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

function SortableSectionTab({
  section,
  selected,
  onSelect,
  onRename,
  onOpenMenu,
  completed = false,
}) {
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
        completed={completed}
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
  hideHeader = false,
  sx,
  children,
}) {
  const theme = useTheme();
  const isLeft = side === "left";
  const isLightMode = theme.palette.mode === "light";
  const rightRailBg = isLightMode ? "#62717e" : CHROME_BG;
  const leftRailBg = isLightMode ? "#24303a" : CHROME_BG;
  const rightRailBorder = isLightMode ? "rgba(82, 90, 100, 0.2)" : GITHUB_BORDER;
  const railHeaderBg = isLightMode ? "#0c1219" : "transparent";
  const rightRailText = isLightMode ? "#f5f7fa" : CHROME_TEXT;

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
        borderColor: isLeft ? CHROME_BORDER : rightRailBorder,
        bgcolor: isLeft ? leftRailBg : rightRailBg,
        backgroundImage: "none",
        boxShadow: isLeft
          ? "none"
          : isLightMode
            ? "-9px 0 16px -10px rgba(24, 39, 56, 0.46)"
            : "-9px 0 16px -10px rgba(0, 0, 0, 0.52)",
        transition: "width 180ms ease",
        overflow: "hidden",
        overscrollBehavior: "contain",
        backdropFilter: "blur(10px)",
        borderRadius: 0,
        borderRight: 0,
        borderLeft: 0,
        mt: { xs: 0, xl: 0 },
        mb: { xs: 0, xl: 0 },
        ml: 0,
        mr: 0,
        pt: 0,
        ...sx,
      }}
    >
      {hideHeader ? null : (
        <Box
          sx={{
            px: isLeft ? 1.4 : 1.75,
            py: isLeft ? 0.65 : 0.9,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexDirection: "row",
            gap: 0.55,
            flexShrink: 0,
            borderBottom: 0,
            background: "none",
            backgroundColor: railHeaderBg,
            minHeight: collapsed ? 0 : isLeft ? 38 : 44,
            position: "relative",
            zIndex: 3,
          }}
        >
          {collapsed ? null : title ? (
            <Typography
              variant="subtitle1"
              sx={{
                position: "static",
                left: "auto",
                transform: "none",
                color: !isLeft ? rightRailText : CHROME_TEXT,
                fontWeight: 400,
                fontSize: "1rem",
                letterSpacing: -0.01,
                lineHeight: 1.1,
                textAlign: "left",
                pointerEvents: "auto",
                whiteSpace: "nowrap",
                order: 1,
                ml: isLeft ? 0 : 1.45,
                flexGrow: 1,
              }}
            >
              {title}
            </Typography>
          ) : null}
          <Tooltip title={collapsed ? `Expand ${title}` : `Collapse ${title}`}>
            <IconButton
              onClick={onToggleCollapsed}
              size="small"
              sx={{ order: 2, color: !isLeft ? rightRailText : "#ffffff" }}
            >
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
      )}

      {collapsed ? (
        <Box
          sx={{
            px: 0.35,
            py: 0.6,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 0.5,
            overflowY: "auto",
            minHeight: 0,
            ...subtleScrollbarSx,
            overscrollBehavior: "contain",
          }}
        >
          <Tooltip title={collapsed ? `Expand ${title || "tools"}` : `Collapse ${title || "tools"}`}>
            <IconButton
              onClick={onToggleCollapsed}
              size="small"
              sx={{
                color: !isLeft ? rightRailText : "#ffffff",
                bgcolor: !isLeft ? "rgba(255,255,255,0.08)" : "transparent",
                "&:hover": {
                  bgcolor: !isLeft ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)",
                },
              }}
            >
              {isLeft ? <ChevronRightRounded /> : <ChevronLeftRounded />}
            </IconButton>
          </Tooltip>
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
            {isLeft ? "Sections" : "REQ"}
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            p: isLeft ? 2 : 0,
            pt: 0,
            display: "flex",
            flexDirection: "column",
            gap: isLeft ? 0.1 : 0,
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

      {!collapsed ? (
        <Box
          onMouseDown={onResizeStart}
          sx={{
            position: "absolute",
            top: 80,
            bottom: 0,
            left: isLeft ? "auto" : -5,
            right: isLeft ? -5 : "auto",
            width: 10,
            cursor: "col-resize",
            zIndex: 10,
            display: { xs: "none", xl: "flex" },
            alignItems: "center",
            justifyContent: "center",
            "&::after": {
              content: '""',
              width: 3,
              height: "100%",
              borderRadius: 999,
              bgcolor: "transparent",
              boxShadow: "none",
            },
            "&::before": {
              content: '""',
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 6,
              height: 54,
              borderRadius: 999,
              bgcolor: "rgba(255, 255, 255, 0.82)",
              boxShadow:
                "0 0 0 1px rgba(17, 24, 39, 0.14), 0 2px 8px rgba(15, 23, 42, 0.18)",
            },
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
  return buildDefaultMtsDefinitionPanelPrompt(sectionLabel, "Dependencies");
}

function buildDefaultMtsSolutionPrompt(sectionLabel) {
  const scopedSection = String(sectionLabel || "this section").trim();
  return [
    `Draft a technically dense MTS Solution for ${scopedSection}.`,
    "Read all provided requirements as the full minimum baseline the evaluator will expect to be covered.",
    "Write the minimum credible, compliant, and executable solution that would satisfy the requirement set.",
    "Be comprehensive and specific about people, roles, teaming structure, processes, workflows, governance, tooling, systems, environments, controls, deliverables, and quality/performance management.",
    "Explain how the work would actually be executed, coordinated, monitored, and delivered.",
    "Focus on minimum evaluator expectations, not discriminators or stretch features.",
    "Do not restate the requirements one by one.",
    "Avoid dense walls of text.",
    "Prefer short structured paragraphs or bullets when they improve readability.",
    "If bullets are used, begin each bullet with a short titled lead-in followed by a specific explanation.",
    "Do not use marketing language or fluff.",
  ].join(" ");
}

function buildDefaultRiskGenerationPrompt(sectionLabel) {
  const scopedSection = String(sectionLabel || "this section").trim();
  return [
    `Review all provided requirements for ${scopedSection} and identify up to 3 evaluator-visible performance or execution risks.`,
    "Focus on risks an evaluator could reasonably infer from complexity, ambiguity, coordination burden, staffing burden, tooling burden, integration burden, schedule sensitivity, quality risk, transition risk, compliance exposure, or dependency exposure.",
    "Each risk must be grounded in the requirement set and written from an evaluator perspective.",
    "For each risk, provide a concise mitigation that would satisfy minimum evaluator expectations.",
    "Return strict JSON only as an array with up to 3 objects.",
    'Each object must use: {"risk":"...","mitigation":"..."}',
    "Do not include markdown, commentary, or any text outside the JSON array.",
  ].join(" ");
}

function buildDefaultMtsDefinitionPanelPrompt(sectionLabel, panelLabel) {
  const scopedSection = String(sectionLabel || "this section").trim();
  const scopedPanel = String(panelLabel || "Dependencies").trim();

  if (scopedPanel === "Dependencies") {
    return [
      `Create a complete list of every document reference mentioned for ${scopedSection}.`,
      "Include all document types you see, such as appendices, attachments, annexes, exhibits, schedules, PWSs, SOWs, SOOs, guides, manuals, plans, standards, specifications, drawings, forms, templates, reports, reference documents, and similar named documents.",
      "List the document whenever the text refers to a separate document, appendix, attachment, sectioned artifact, or named reference.",
      "Do not stop early. Capture every document reference you can find.",
      "Prefer a clean readable list format.",
      "Use bullets when they help, but plain short lines are also acceptable.",
      "For each item, give the document title and a short description or context note.",
    ].join(" ");
  }

  return [
    `Write a concise Meets the standard definition for ${scopedSection} as ${scopedPanel} from these selected requirements as a grouped objective.`,
    "Do not restate the requirements.",
    "Start with a short two-sentence bottom-line definition that explains, in plain evaluator-facing language, what the requirement set is really demanding overall and what kind of real-world solution will be needed to satisfy it.",
    "After that opening summary, continue in a readable structured format.",
    "State what an evaluator is really looking for: the minimum credible and executable technical and operational approach, the level of control and integration required, and any unusual requirement that signals risk or likely evaluator scrutiny.",
    "Focus on feasibility, completeness, realism, and performance risk.",
    "Avoid dense walls of text.",
    "Prefer short structured paragraphs or bullets when they improve readability.",
    "If bullets are used, begin each bullet with a short titled lead-in followed by a specific explanation.",
    "No marketing, no strengths, no fluff.",
  ].join(" ");
}

function buildEmptyMtsDefinitionPanels() {
  return MTS_DEFINITION_PANELS.reduce((accumulator, panel) => {
    accumulator[panel.id] = "";
    return accumulator;
  }, {});
}

function parseMtsDefinitionPanels(rawValue) {
  const emptyPanels = buildEmptyMtsDefinitionPanels();
  const trimmedValue = String(rawValue || "").trim();
  if (!trimmedValue) {
    return emptyPanels;
  }

  try {
    const parsed = JSON.parse(trimmedValue);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return MTS_DEFINITION_PANELS.reduce((accumulator, panel) => {
        accumulator[panel.id] = String(parsed?.[panel.id] || "").trim();
        return accumulator;
      }, {});
    }
  } catch {
    return {
      ...emptyPanels,
      definition_1: trimmedValue,
    };
  }

  return emptyPanels;
}

function serializeMtsDefinitionPanels(panelsById) {
  const normalizedPanels = MTS_DEFINITION_PANELS.reduce((accumulator, panel) => {
    accumulator[panel.id] = String(panelsById?.[panel.id] || "").trim();
    return accumulator;
  }, {});

  const hasAnyContent = Object.values(normalizedPanels).some((value) => value);
  return hasAnyContent ? JSON.stringify(normalizedPanels) : "";
}

function normalizeMtsPromptSet(rawPromptSet, sectionLabel) {
  const defaults = MTS_DEFINITION_PANELS.reduce((accumulator, panel) => {
    accumulator[panel.id] = buildDefaultMtsDefinitionPanelPrompt(sectionLabel, panel.label);
    return accumulator;
  }, {});
  defaults["MTS Solution"] = buildDefaultMtsSolutionPrompt(sectionLabel);
  const legacyDefinitionOnePrompt = buildDefaultMtsDefinitionPanelPrompt(sectionLabel, "Definition 1");
  const legacyDependenciesPrompts = new Set([
    [
      `List the titles only for any appendices, attachments, exhibits, referenced plans, standards, or external documents that must be considered for ${sectionLabel}.`,
      "Use one short line per title.",
      "Do not describe or summarize them.",
      "If none are referenced, say None.",
    ].join(" "),
    [
      `List any appendices, attachments, exhibits, referenced plans, standards, or external documents that must be considered for ${sectionLabel}.`,
      "Use one short line per item with the title plus a very brief context note.",
      "Keep the context to a few words only.",
      "If none are referenced, say None.",
    ].join(" "),
    [
      `List only other referenced documents mentioned for ${sectionLabel}.`,
      "Include documents of any type, but only if they are separate referenced documents.",
      "Do not list requirement topics, activities, systems, deliverables, or concepts unless they are named documents.",
      "Use one short line per item with the title plus a very brief context note.",
      "Keep the context to a few words only.",
    ].join(" "),
    [
      `List every other document or document-like artifact referenced for ${sectionLabel}.`,
      "Include appendices, attachments, annexes, exhibits, schedules, plans, manuals, standards, specifications, drawings, forms, templates, reports, reference documents, data item descriptions, and any other named or clearly referenced document.",
      "Capture it if the text points to a separate document even when the title is partial or generic.",
      "Do not list plain topics, systems, activities, capabilities, or deliverables unless they are explicitly treated as a document.",
      "Use one short line per document with the title plus a very brief context note.",
      "Keep the context to a few words only.",
    ].join(" "),
    [
      `List every appendix or separate referenced document mentioned for ${sectionLabel}.`,
      "Explicitly include appendices, attachments, annexes, exhibits, schedules, plans, manuals, standards, specifications, drawings, forms, templates, reports, and reference documents.",
      "Treat it as a dependency only if the text points to a separate document, sectioned artifact, attachment, or named reference.",
      "Do not list related requirements, requirement groups, topics, systems, activities, capabilities, deliverables, or compliance areas unless they are explicitly named as a document or appendix.",
      "Use one short line per document with the title plus a very brief context note.",
      "Keep the context to a few words only.",
    ].join(" "),
  ]);

  if (rawPromptSet && typeof rawPromptSet === "object" && !Array.isArray(rawPromptSet)) {
    const normalizedDefinitions = MTS_DEFINITION_PANELS.reduce((accumulator, panel) => {
      const value = String(rawPromptSet?.[panel.id] || "").trim();
      accumulator[panel.id] =
        panel.id === "definition_1" &&
        (value === legacyDefinitionOnePrompt || legacyDependenciesPrompts.has(value))
          ? defaults[panel.id]
          : value || defaults[panel.id];
      return accumulator;
    }, {});
    normalizedDefinitions["MTS Solution"] =
      String(rawPromptSet?.["MTS Solution"] || "").trim() || defaults["MTS Solution"];
    return normalizedDefinitions;
  }

  const legacyPrompt = String(rawPromptSet || "").trim();
  if (!legacyPrompt) {
    return defaults;
  }

  return MTS_DEFINITION_PANELS.reduce((accumulator, panel) => {
    accumulator[panel.id] = legacyPrompt;
    return accumulator;
  }, {});
}

function createRiskRegisterEntry() {
  return {
    id: `risk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    risk: "",
    mitigation: "",
  };
}

function createExceedsRegisterEntry() {
  return {
    id: `exceeds-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    element: "Real-time performance dashboard and proactive issue alerts",
    rationale:
      "Provides live contract visibility, early warning indicators, and faster issue response than the minimum reporting baseline.",
  };
}

function parseRiskRegister(rawValue) {
  const trimmedValue = String(rawValue || "").trim();
  if (!trimmedValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmedValue);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => ({
          id:
            typeof entry?.id === "string" && entry.id.trim()
              ? entry.id
              : createRiskRegisterEntry().id,
          risk: String(entry?.risk || "").trim(),
          mitigation: String(entry?.mitigation || "").trim(),
        }))
        .filter((entry) => entry.risk || entry.mitigation);
    }
  } catch {
    return [
      {
        ...createRiskRegisterEntry(),
        risk: trimmedValue,
      },
    ];
  }

  return [];
}

function parseGeneratedRiskRegister(rawValue) {
  const rawText = String(rawValue || "").trim();
  if (!rawText) {
    return [];
  }

  const candidates = [rawText];
  const firstBracket = rawText.indexOf("[");
  const lastBracket = rawText.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    candidates.unshift(rawText.slice(firstBracket, lastBracket + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (!Array.isArray(parsed)) {
        continue;
      }

      return parsed
        .slice(0, 3)
        .map((entry) => ({
          id:
            typeof entry?.id === "string" && entry.id.trim()
              ? entry.id
              : createRiskRegisterEntry().id,
          risk: String(entry?.risk || "").trim(),
          mitigation: String(entry?.mitigation || "").trim(),
        }))
        .filter((entry) => entry.risk && entry.mitigation);
    } catch {}
  }

  return [];
}

function parseExceedsRegister(rawValue) {
  const trimmedValue = String(rawValue || "").trim();
  if (!trimmedValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmedValue);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => ({
          id:
            typeof entry?.id === "string" && entry.id.trim()
              ? entry.id
              : createExceedsRegisterEntry().id,
          element: String(entry?.element || "").trim(),
          rationale: String(entry?.rationale || "").trim(),
        }))
        .filter((entry) => entry.element || entry.rationale);
    }
  } catch {
    return [
      {
        ...createExceedsRegisterEntry(),
        element: "Differentiated solution element",
        rationale: trimmedValue,
      },
    ];
  }

  return [];
}

function serializeRiskRegister(entries) {
  const normalizedEntries = entries
    .map((entry) => ({
      id: entry.id || createRiskRegisterEntry().id,
      risk: String(entry.risk || "").trim(),
      mitigation: String(entry.mitigation || "").trim(),
    }))
    .filter((entry) => entry.risk || entry.mitigation);

  return normalizedEntries.length ? JSON.stringify(normalizedEntries) : "";
}

function serializeExceedsRegister(entries) {
  const normalizedEntries = entries
    .map((entry) => ({
      id: entry.id || createExceedsRegisterEntry().id,
      element: String(entry.element || "").trim(),
      rationale: String(entry.rationale || "").trim(),
    }))
    .filter((entry) => entry.element || entry.rationale);

  return normalizedEntries.length ? JSON.stringify(normalizedEntries) : "";
}

function normalizeStormWorkspaceNotes(notesBySection) {
  if (!notesBySection || typeof notesBySection !== "object" || Array.isArray(notesBySection)) {
    return {};
  }

  return Object.entries(notesBySection).reduce((accumulator, [sectionId, notes]) => {
    if (!notes || typeof notes !== "object" || Array.isArray(notes)) {
      return accumulator;
    }

    const legacyStormValue = notes.STORM;
    const legacySolutionValue = notes["MTS Solution"];
    accumulator[sectionId] = {
      ...buildEmptyStormWorkspace(),
      ...notes,
      "MTS Definition": serializeMtsDefinitionPanels(parseMtsDefinitionPanels(notes["MTS Definition"])),
      "MTS Solution":
        typeof legacySolutionValue === "string"
          ? legacySolutionValue
          : typeof legacyStormValue === "string"
            ? legacyStormValue
            : "",
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

function normalizeGeneratedStormText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function applyInlineMarkdownHtml(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
  html = html.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
  return html;
}

function isMarkdownTableSeparator(line) {
  const trimmed = String(line || "").trim();
  return /^\|?[\s:-]+(?:\|[\s:-]+)+\|?$/.test(trimmed);
}

function isMarkdownTableRow(line) {
  const trimmed = String(line || "").trim();
  return trimmed.includes("|") && /^\|?.+\|.+\|?$/.test(trimmed);
}

function parseMarkdownTableRow(line) {
  return String(line || "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseListLine(line) {
  const match = String(line || "").match(/^(\s*)([-*•]|\d+[.)])\s+(.+)$/);
  if (!match) {
    return null;
  }

  return {
    ordered: /\d+[.)]/.test(match[2]),
    text: match[3].trim(),
  };
}

function parseMarkdownHeadingLine(line) {
  const match = String(line || "").match(/^\s*(#{1,6})\s+(.+?)\s*$/);
  if (!match) {
    return null;
  }

  return {
    level: match[1].length,
    text: match[2].trim(),
  };
}

function parseTitledLeadIn(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return null;
  }

  const markdownTitleMatch = trimmed.match(
    /^(?:\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_)\s*:?\s*(.*)$/,
  );
  if (markdownTitleMatch) {
    const title = (
      markdownTitleMatch[1] ||
      markdownTitleMatch[2] ||
      markdownTitleMatch[3] ||
      markdownTitleMatch[4] ||
      ""
    ).trim();
    const detail = String(markdownTitleMatch[5] || "").trim();
    return title ? { title, detail } : null;
  }

  const titledMatch = trimmed.match(/^([^:]{2,120}):\s+(.+)$/);
  if (!titledMatch) {
    return null;
  }

  return {
    title: titledMatch[1].trim(),
    detail: titledMatch[2].trim(),
  };
}

function isProbablyHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ""));
}

function richTextToPlainText(value) {
  const rawValue = String(value || "");
  if (!rawValue.trim()) {
    return "";
  }

  if (!isProbablyHtml(rawValue) || typeof window === "undefined" || typeof DOMParser === "undefined") {
    return rawValue;
  }

  const documentNode = new DOMParser().parseFromString(rawValue, "text/html");
  return String(documentNode.body.textContent || "").trim();
}

function renderStoredRichTextHtml(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "<p><em>No content.</em></p>";
  }

  if (isProbablyHtml(rawValue)) {
    return rawValue;
  }

  return renderPlainTextHtml(rawValue);
}

function convertGeneratedStormTextToHtml(value) {
  const normalized = normalizeGeneratedStormText(value);
  if (!normalized) {
    return "";
  }

  const lines = normalized.split("\n");
  return renderStormBlocksAsHtml(parseStormTextBlocks(lines));
}

function parseStormTextBlocks(lines) {
  const blocks = [];
  let paragraphBuffer = [];
  let listBuffer = [];

  const flushParagraph = () => {
    if (!paragraphBuffer.length) {
      return;
    }
    const paragraphLines = paragraphBuffer.map((line) => line.trim()).filter(Boolean);
    if (paragraphLines.length > 1 && paragraphLines.every((line) => parseTitledLeadIn(line))) {
      blocks.push({
        type: "titled-paragraph-group",
        items: paragraphLines,
      });
    } else {
      blocks.push({
        type: "paragraph",
        text: paragraphBuffer.join("\n"),
      });
    }
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!listBuffer.length) {
      return;
    }
    blocks.push({
      type: "list",
      ordered: listBuffer[0]?.ordered || false,
      items: listBuffer.map((item) => item.text),
    });
    listBuffer = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (
      index + 1 < lines.length &&
      isMarkdownTableRow(line) &&
      isMarkdownTableSeparator(lines[index + 1])
    ) {
      flushParagraph();
      flushList();
      const header = parseMarkdownTableRow(line);
      const rows = [];
      index += 2;
      while (index < lines.length && isMarkdownTableRow(lines[index])) {
        rows.push(parseMarkdownTableRow(lines[index]));
        index += 1;
      }
      index -= 1;
      blocks.push({ type: "table", header, rows });
      continue;
    }

    const heading = parseMarkdownHeadingLine(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading.level, text: heading.text });
      continue;
    }

    const listItem = parseListLine(line);
    if (listItem) {
      flushParagraph();
      if (listBuffer.length && listBuffer[0].ordered !== listItem.ordered) {
        flushList();
      }
      listBuffer.push(listItem);
      continue;
    }

    flushList();
    paragraphBuffer.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

function renderStormBlocksAsHtml(blocks) {
  return blocks
    .map((block) => {
      if (block.type === "titled-paragraph-group") {
        return block.items
          .map((item) => {
            const titledLeadIn = parseTitledLeadIn(item);
            if (!titledLeadIn) {
              return `<p>${applyInlineMarkdownHtml(item)}</p>`;
            }
            return `<p><strong>${applyInlineMarkdownHtml(titledLeadIn.title)}</strong>${
              titledLeadIn.detail ? `: ${applyInlineMarkdownHtml(titledLeadIn.detail)}` : ""
            }</p>`;
          })
          .join("");
      }

      if (block.type === "table") {
        return `<table><thead><tr>${block.header
          .map((cell) => `<th>${applyInlineMarkdownHtml(cell)}</th>`)
          .join("")}</tr></thead><tbody>${block.rows
          .map(
            (row) =>
              `<tr>${row
                .map((cell) => `<td>${applyInlineMarkdownHtml(cell)}</td>`)
                .join("")}</tr>`,
          )
          .join("")}</tbody></table>`;
      }

      if (block.type === "heading") {
        const level = Math.min(Math.max(Number(block.level) || 2, 1), 6);
        return `<h${level}>${applyInlineMarkdownHtml(block.text)}</h${level}>`;
      }

      if (block.type === "list") {
        const tag = block.ordered ? "ol" : "ul";
        return `<${tag}>${block.items
          .map((item) => {
            const titledLeadIn = parseTitledLeadIn(item);
            if (titledLeadIn) {
              return `<li><strong>${applyInlineMarkdownHtml(titledLeadIn.title)}</strong>${
                titledLeadIn.detail ? `: ${applyInlineMarkdownHtml(titledLeadIn.detail)}` : ""
              }</li>`;
            }
            return `<li>${applyInlineMarkdownHtml(item)}</li>`;
          })
          .join("")}</${tag}>`;
      }

      return `<p>${applyInlineMarkdownHtml(block.text).replaceAll("\n", "<br />")}</p>`;
    })
    .join("");
}

function convertStreamingStormTextToHtml(value) {
  const rawValue = String(value || "").replace(/\r/g, "");
  const normalized = normalizeGeneratedStormText(rawValue);
  if (!normalized) {
    return "";
  }

  const hasTrailingNewline = /\n$/.test(rawValue);
  const lines = normalized.split("\n");
  const trailingLine = hasTrailingNewline ? "" : lines.pop() || "";
  const completedHtml = renderStormBlocksAsHtml(parseStormTextBlocks(lines));
  const trailingHtml = trailingLine
    ? `<p>${escapeHtml(trailingLine).replaceAll("\n", "<br />")}</p>`
    : "";

  return `${completedHtml}${trailingHtml}`;
}

function renderPlainTextHtml(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "<p><em>No content.</em></p>";
  }

  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br />")}</p>`)
    .join("");
}

function renderRequirementHtml(title, value) {
  const trimmed = String(value || "").trim();
  const titleHtml = `<strong>${escapeHtml(title)}</strong>`;
  if (!trimmed) {
    return `<p>${titleHtml} <em>No requirement text.</em></p>`;
  }

  const paragraphs = trimmed.split(/\n{2,}/);
  const [firstParagraph, ...restParagraphs] = paragraphs;
  return [
    `<p>${titleHtml} ${escapeHtml(firstParagraph).replaceAll("\n", "<br />")}</p>`,
    ...restParagraphs.map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br />")}</p>`),
  ].join("");
}

function slugifyExportName(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "section-export";
}

function buildSectionExportHtml({
  projectLabel,
  section,
  requirementsScope,
  stormNotes,
  definitionPanels,
}) {
  const riskEntries = parseRiskRegister(stormNotes?.Risks);
  const exceedsEntries = parseExceedsRegister(stormNotes?.["Exceeds MTS"]);
  const solutionText = String(stormNotes?.["MTS Solution"] || "").trim();
  const dependenciesText = String(definitionPanels?.definition_1 || "").trim();
  const mtsDefinitionText = String(definitionPanels?.definition_2 || "").trim();
  const exportedAt = new Date().toLocaleString();
  const requirementsHtml = requirementsScope.length
    ? requirementsScope
        .map(({ requirement, depth }, index) => {
          const title = String(requirement?.title || requirement?.sourceRef || `Requirement ${index + 1}`).trim();
          const summary = String(
            requirement?.text || requirement?.summary || requirement?.intent || "",
          ).trim();
          const indentPx = depth * 28;
          return `
            <div class="requirement-block" style="margin-left:${indentPx}px;">
              <div class="requirement-body">
                ${renderRequirementHtml(title, summary)}
              </div>
            </div>
          `;
        })
        .join("")
    : "<p><em>No requirements in this section.</em></p>";

  const exceedsHtml = exceedsEntries.length
    ? `<ul>${exceedsEntries
        .map(
          (entry) =>
            `<li><strong>${escapeHtml(entry.element || "Exceeds Element")}</strong><br />${escapeHtml(
              entry.rationale || "",
            )}</li>`,
        )
        .join("")}</ul>`
    : "<p><em>No exceeds content.</em></p>";

  const risksHtml = riskEntries.length
    ? `<ul>${riskEntries
        .map(
          (entry) =>
            `<li><strong>Risk:</strong> ${escapeHtml(entry.risk || "")}<br /><strong>Mitigation:</strong> ${escapeHtml(
              entry.mitigation || "",
            )}</li>`,
        )
        .join("")}</ul>`
    : "<p><em>No risks captured.</em></p>";

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(section?.label || "Section Export")}</title>
      <style>
        @page { margin: 1in; }
        body { font-family: Calibri, Arial, sans-serif; color: #111827; margin: 0; line-height: 1.45; }
        h1 { font-size: 22pt; margin: 0 0 6px; }
        h2 { font-size: 15pt; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #cbd5e1; }
        h3 { font-size: 12pt; margin: 16px 0 6px; }
        p { margin: 0 0 10px; }
        .meta { color: #475569; font-size: 9.5pt; margin: 2px 0 8px; }
        .requirement-block { margin-bottom: 8px; }
        .requirement-body { font-size: 8pt; line-height: 1.12; }
        .requirement-body p { margin: 0 0 4px; }
        .requirement-body p:last-child { margin-bottom: 0; }
        table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; }
        th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
        th { background: #e2e8f0; font-size: 10pt; }
        td { font-size: 9pt; line-height: 1.22; }
        ul { margin: 0; padding-left: 20px; }
        li { margin: 0 0 10px; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(section?.label || "Section Export")}</h1>
      <p class="meta">${projectLabel ? `Project: ${escapeHtml(projectLabel)} | ` : ""}Exported: ${escapeHtml(exportedAt)}</p>
      <h2>Requirements</h2>
      ${requirementsHtml}
      <h2>MTS Definition</h2>
      <h3>Dependencies</h3>
      ${renderStoredRichTextHtml(dependenciesText)}
      <h3>MTS Definition</h3>
      ${renderStoredRichTextHtml(mtsDefinitionText)}
      <h2>MTS Solution</h2>
      ${renderStoredRichTextHtml(solutionText)}
      <h2>Exceeds MTS</h2>
      ${exceedsHtml}
      <h2>Risks</h2>
      ${risksHtml}
    </body>
  </html>`;
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
  onGenerateMtsSolution,
  onGenerateRisks,
  onClearActiveTab,
  onEditMtsPrompt,
  generationState,
  activeSection,
  activeSectionRequirementCount,
  hideCollapseToggle = false,
  onToggleCollapsed,
  definitionPanels,
  definitionPrompts,
}) {
  const theme = useTheme();
  const isLightMode = theme.palette.mode === "light";
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [riskDraft, setRiskDraft] = useState(createRiskRegisterEntry());
  const [riskDeleteId, setRiskDeleteId] = useState("");
  const [exceedsDialogOpen, setExceedsDialogOpen] = useState(false);
  const [exceedsDraft, setExceedsDraft] = useState(createExceedsRegisterEntry());
  const [exceedsDeleteId, setExceedsDeleteId] = useState("");
  const panelBg = "transparent";
  const panelBorder = "transparent";
  const activeTabSurface = isLightMode ? LIGHT_SHARED_SURFACE : "#2b3542";
  const panelToolbarBg = isLightMode ? "#3c4a56" : activeTabSurface;
  const panelEditorBg = isLightMode ? "#495764" : "transparent";
  const panelCardHover = isLightMode ? "#e3e9f0" : activeTabSurface;
  const panelText = isLightMode ? "#f5f7fa" : CHROME_TEXT;
  const panelMutedText = isLightMode ? "rgba(245, 247, 250, 0.72)" : CHROME_TEXT_MUTED;
  const panelAction = isLightMode ? "#64d3e3" : AI_ACTION;
  const tabChromeBg = "transparent";
  const activeTabText = isLightMode ? "#ffffff" : panelText;
  const selectedTabBg = isLightMode ? "#58a6ff" : "#141a21";
  const inactiveTabText = isLightMode ? "#f6f9fc" : panelMutedText;
  const inactiveTabBg = isLightMode ? "#556572" : "rgba(255,255,255,0.03)";
  const riskEntries = useMemo(
    () => (activeTab === "Risks" ? parseRiskRegister(notesByTab.Risks) : []),
    [activeTab, notesByTab.Risks],
  );
  const exceedsEntries = useMemo(
    () => (activeTab === "Exceeds MTS" ? parseExceedsRegister(notesByTab["Exceeds MTS"]) : []),
    [activeTab, notesByTab],
  );
  const showDefinitionPanels = activeTab === "MTS Definition";
  const showStandaloneToolbar = activeTab !== "MTS Definition";
  const canGenerateStormContent =
    (activeTab === "MTS Definition" || activeTab === "MTS Solution") &&
    Boolean(activeSection?.id) &&
    activeSectionRequirementCount > 0 &&
    !generationState.loading;

  function openRiskDialog() {
    setRiskDraft(createRiskRegisterEntry());
    setRiskDialogOpen(true);
  }

  function closeRiskDialog() {
    setRiskDialogOpen(false);
  }

  function openExceedsDialog() {
    setExceedsDraft(createExceedsRegisterEntry());
    setExceedsDialogOpen(true);
  }

  function closeExceedsDialog() {
    setExceedsDialogOpen(false);
  }

  function openRiskDeleteDialog(riskId) {
    setRiskDeleteId(riskId);
  }

  function closeRiskDeleteDialog() {
    setRiskDeleteId("");
  }

  function openExceedsDeleteDialog(entryId) {
    setExceedsDeleteId(entryId);
  }

  function closeExceedsDeleteDialog() {
    setExceedsDeleteId("");
  }

  function updateRiskDraft(field, value) {
    setRiskDraft((current) => ({ ...current, [field]: value }));
  }

  function updateExceedsDraft(field, value) {
    setExceedsDraft((current) => ({ ...current, [field]: value }));
  }

  function saveRiskDraft() {
    if (!riskDraft.risk.trim() || !riskDraft.mitigation.trim()) {
      return;
    }

    onNotesChange(
      "Risks",
      serializeRiskRegister([...riskEntries, riskDraft]),
    );
    setRiskDialogOpen(false);
  }

  function confirmRiskDelete() {
    if (!riskDeleteId) {
      return;
    }

    onNotesChange(
      "Risks",
      serializeRiskRegister(riskEntries.filter((candidate) => candidate.id !== riskDeleteId)),
    );
    setRiskDeleteId("");
  }

  function saveExceedsDraft() {
    if (!exceedsDraft.element.trim() || !exceedsDraft.rationale.trim()) {
      return;
    }

    onNotesChange(
      "Exceeds MTS",
      serializeExceedsRegister([...exceedsEntries, exceedsDraft]),
    );
    setExceedsDialogOpen(false);
  }

  function confirmExceedsDelete() {
    if (!exceedsDeleteId) {
      return;
    }

    onNotesChange(
      "Exceeds MTS",
      serializeExceedsRegister(
        exceedsEntries.filter((candidate) => candidate.id !== exceedsDeleteId),
      ),
    );
    setExceedsDeleteId("");
  }

  return (
      <Paper
      variant="outlined"
      sx={{
        borderRadius: { xs: 0.5, xl: 0 },
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        height: "100%",
        bgcolor: panelBg,
        backgroundImage: "none",
        boxShadow: { xs: "0 18px 32px rgba(0, 0, 0, 0.12)", xl: "none" },
        borderTop: 0,
        borderLeft: 0,
        borderRight: 0,
        borderBottom: 0,
        borderColor: panelBorder,
      }}
    >
      <Box
        sx={{
          px: 0,
          pt: 0,
          pb: 0,
          background: "transparent",
          borderBottom: 0,
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1}
          alignItems={{ xs: "stretch", md: "center" }}
          justifyContent="flex-start"
        >
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{
              position: "relative",
              px: 2.9,
              py: 1.1,
              width: "100%",
              justifyContent: "flex-start",
            }}
          >
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexWrap: "nowrap",
                alignItems: "stretch",
                justifyContent: "stretch",
                gap: 1,
                width: "100%",
              }}
            >
              {STORM_WORKSPACE_TABS.map((label) => {
                const selected = activeTab === label;
                const TabIcon = STORM_WORKSPACE_TAB_ICONS[label] || TrackChangesRounded;
                return (
                  <Button
                    key={label}
                    onClick={() => onTabChange(label)}
                    variant="text"
                    sx={{
                      position: "relative",
                      flex: "1 1 0",
                      minHeight: 58,
                      minWidth: 0,
                      px: 1.05,
                      py: 0.85,
                      mb: 0,
                      borderRadius: 0.5,
                      color: selected ? activeTabText : inactiveTabText,
                      bgcolor: selected ? selectedTabBg : inactiveTabBg,
                      border: "0 solid transparent",
                      boxShadow: "none",
                      fontSize: "0.92rem",
                      lineHeight: 1.1,
                      fontWeight: 600,
                      justifyContent: "center",
                      textAlign: "center",
                      textTransform: "none",
                      overflow: "hidden",
                      "&:hover": {
                        bgcolor: selected
                          ? activeTabSurface
                          : isLightMode
                            ? "#667784"
                            : "rgba(255,255,255,0.07)",
                        color: selected ? activeTabText : inactiveTabText,
                      },
                    }}
                  >
                    <Box
                      component="span"
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.68,
                        justifyContent: "center",
                        width: "100%",
                      }}
                    >
                      <TabIcon sx={{ fontSize: 17, color: "inherit", flexShrink: 0 }} />
                      <Box component="span">{label}</Box>
                    </Box>
                  </Button>
                );
              })}
            </Box>
          </Stack>
        </Stack>
      </Box>
      <Box
        sx={{
          pt: 0.1,
          pb: 2.2,
          pl: 0,
          pr: 0,
          flex: "1 1 auto",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          overscrollBehavior: "contain",
          backgroundColor: "transparent",
          borderTop: 0,
          ...subtleScrollbarSx,
        }}
      >
        <Stack spacing={0.7} sx={{ flex: 1, minHeight: 0 }}>
          {generationState.error ? (
            <Box sx={{ px: 1.8 }}>
              <Alert severity="error">{generationState.error}</Alert>
            </Box>
          ) : null}
          {showStandaloneToolbar ? (
            <Box sx={{ px: 2.9, mb: activeTab === "Risks" ? 0 : -1.65 }}>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  fontFamily: GITHUB_FONT_STACK,
                  fontSize: "0.875rem",
                  lineHeight: 1.45,
                  bgcolor: panelToolbarBg,
                  border: `1px solid ${panelBorder}`,
                  borderRadius: 0.5,
                  overflow: "hidden",
                  boxShadow: "none",
                }}
                >
                  <Stack
                    direction="row"
                  spacing={1}
                  alignItems="center"
                  justifyContent={activeTab === "Risks" ? "flex-start" : "space-between"}
                  sx={{
                    px: activeTab === "Risks" ? 1 : 1,
                    py: 0.45,
                    bgcolor: "transparent",
                    borderBottom: 0,
                    flexShrink: 0,
                  }}
                  >
                  {activeTab === "Risks" ? null : (
                    <Typography variant="body2" sx={{ color: panelText, fontWeight: 600 }}>
                      {activeTab}
                    </Typography>
                  )}
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ flexShrink: 0, ml: activeTab === "Risks" ? 0 : "auto" }}
                  >
                    {activeTab === "Risks" || activeTab === "MTS Definition" ? null : (
                      <Button
                        variant="text"
                        onClick={onClearActiveTab}
                        size="small"
                        sx={{
                          minHeight: 26,
                          py: 0.2,
                          minWidth: 0,
                          color: panelText,
                          borderColor: "transparent",
                          bgcolor: "transparent",
                          boxShadow: isLightMode
                            ? "0 1px 0 rgba(17,24,39,0.04), 0 3px 8px rgba(17,24,39,0.08)"
                            : "none",
                          "&:hover": { bgcolor: "transparent", borderColor: "transparent" },
                        }}
                      >
                        Clear
                      </Button>
                    )}
                    {activeTab === "MTS Definition" ? null : activeTab === "MTS Solution" ? (
                      <>
                        <Button
                          variant="text"
                          onClick={() => onEditMtsPrompt("MTS Solution")}
                          size="small"
                          sx={{
                            minHeight: 26,
                            py: 0.2,
                            minWidth: 0,
                            color: panelText,
                            borderColor: "transparent",
                            bgcolor: "transparent",
                            boxShadow: "none",
                            "&:hover": { bgcolor: "transparent", borderColor: "transparent" },
                          }}
                        >
                          Edit Prompt
                        </Button>
                        <Button
                          variant="text"
                          onClick={onGenerateMtsSolution}
                          disabled={!canGenerateStormContent}
                          startIcon={
                            generationState.loading === "MTS Solution" ? (
                              <CircularProgress size={16} color="inherit" />
                            ) : null
                          }
                          sx={{
                            minHeight: 24,
                            px: 0.8,
                            py: 0.1,
                            borderRadius: 0.75,
                            bgcolor: "transparent",
                            color: "#2ea36a",
                            boxShadow: "none",
                            "& .MuiButton-startIcon": {
                              mr: 0.45,
                              ml: 0,
                            },
                            "&:hover": {
                              bgcolor: "transparent",
                              color: "#278b5a",
                            },
                          }}
                        >
                          {generationState.loading === "MTS Solution" ? "Generating..." : "Generate"}
                        </Button>
                      </>
                    ) : activeTab === "Risks" ? (
                      <>
                        <Button
                          variant="text"
                          onClick={onGenerateRisks}
                          startIcon={
                            generationState.loading === "Risks" ? (
                              <CircularProgress size={16} color="inherit" />
                            ) : null
                          }
                          sx={{
                            minHeight: 26,
                            py: 0.2,
                            minWidth: 0,
                            borderRadius: 0.75,
                            bgcolor: "transparent",
                            color: "#2ea36a",
                            boxShadow: "none",
                            "&:hover": {
                              bgcolor: "transparent",
                              color: "#278b5a",
                            },
                          }}
                        >
                          {generationState.loading === "Risks" ? "Generating..." : "Generate Risks"}
                        </Button>
                        <Button
                          variant="text"
                          startIcon={<PlaylistAddRounded />}
                          onClick={openRiskDialog}
                          sx={{
                            minHeight: 26,
                            py: 0.2,
                            minWidth: 0,
                            borderRadius: 0.75,
                            bgcolor: "transparent",
                            color: panelText,
                            boxShadow: "none",
                            "&:hover": {
                              bgcolor: "transparent",
                              color: panelText,
                            },
                          }}
                        >
                          Add Risk
                        </Button>
                      </>
                    ) : activeTab === "Exceeds MTS" ? (
                      <Button
                        variant="text"
                        startIcon={<PlaylistAddRounded />}
                        onClick={openExceedsDialog}
                        sx={{
                          minHeight: 26,
                          py: 0.2,
                          minWidth: 0,
                          borderRadius: 0.75,
                          bgcolor: "transparent",
                          color: panelText,
                          boxShadow: "none",
                          "&:hover": {
                            bgcolor: "transparent",
                            color: panelText,
                          },
                        }}
                      >
                        Add Exceeds Element
                      </Button>
                    ) : null}
                    {hideCollapseToggle || !onToggleCollapsed ? null : (
                      <Tooltip title="Collapse Tools">
                        <IconButton
                          size="small"
                          onClick={onToggleCollapsed}
                          sx={{
                            ml: 0.25,
                            width: 28,
                            height: 28,
                            color: panelText,
                            bgcolor: "rgba(255,255,255,0.08)",
                            "&:hover": {
                              bgcolor: "rgba(255,255,255,0.14)",
                            },
                          }}
                        >
                          <ChevronRightRounded sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                </Stack>
              </Box>
            </Box>
          ) : null}
          <Box
            sx={{
              px: 2.9,
              flex: 1,
              minHeight: 0,
              display: "flex",
            }}
          >
            {showDefinitionPanels ? (
              <Stack
                spacing={1.25}
                sx={{
                  flex: 1,
                  minHeight: 0,
                }}
              >
                {MTS_DEFINITION_PANELS.map((panel) => {
                  const isGeneratingThisPanel = generationState.loading === panel.id;
                  const panelValue = definitionPanels?.[panel.id] || "";
                  const panelFlex = panel.id === "definition_1" ? 0.72 : 1.28;
                  return (
                    <Stack key={panel.id} spacing={1.05} sx={{ flex: panelFlex, minHeight: 0 }}>
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          fontFamily: GITHUB_FONT_STACK,
                          fontSize: "0.875rem",
                          lineHeight: 1.45,
                          bgcolor: panelToolbarBg,
                          border: `1px solid ${panelBorder}`,
                          borderRadius: 0.5,
                          overflow: "hidden",
                          boxShadow: "none",
                          flexShrink: 0,
                        }}
                      >
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          justifyContent="space-between"
                          sx={{
                            px: 1,
                            py: 0.45,
                            bgcolor: "transparent",
                            borderBottom: 0,
                            flexShrink: 0,
                          }}
                        >
                          <Typography variant="body2" sx={{ color: panelText, fontWeight: 600 }}>
                            {panel.label}
                          </Typography>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Button
                              variant="text"
                              onClick={() => onClearActiveTab(panel.id)}
                              size="small"
                              sx={{
                                minHeight: 26,
                                py: 0.2,
                                minWidth: 0,
                                color: panelText,
                                borderColor: "transparent",
                                bgcolor: "transparent",
                                boxShadow: "none",
                                "&:hover": { bgcolor: "transparent", borderColor: "transparent" },
                              }}
                            >
                              Clear
                            </Button>
                            <Button
                              variant="text"
                              onClick={() => onEditMtsPrompt(panel.id)}
                              size="small"
                              sx={{
                                minHeight: 26,
                                py: 0.2,
                                minWidth: 0,
                                color: panelText,
                                borderColor: "transparent",
                                bgcolor: "transparent",
                                boxShadow: "none",
                                "&:hover": { bgcolor: "transparent", borderColor: "transparent" },
                              }}
                            >
                              Edit Prompt
                            </Button>
                            <Button
                              variant="text"
                              onClick={() => onGenerateMtsDefinition(panel.id)}
                              disabled={!canGenerateStormContent}
                              startIcon={
                                isGeneratingThisPanel ? (
                                  <CircularProgress size={16} color="inherit" />
                                ) : null
                              }
                              sx={{
                                minHeight: 24,
                                px: 0.8,
                                py: 0.1,
                                borderRadius: 0.75,
                                bgcolor: "transparent",
                                color: "#2ea36a",
                                boxShadow: "none",
                                "& .MuiButton-startIcon": {
                                  mr: 0.45,
                                  ml: 0,
                                },
                                "&:hover": {
                                  bgcolor: "transparent",
                                  color: "#278b5a",
                                },
                              }}
                            >
                              {isGeneratingThisPanel ? "Generating..." : "Generate"}
                            </Button>
                          </Stack>
                        </Stack>
                      </Box>
                      <Box
                        sx={{
                          flex: 1,
                          minHeight: 0,
                          display: "flex",
                          flexDirection: "column",
                          fontFamily: GITHUB_FONT_STACK,
                          fontSize: "0.875rem",
                          lineHeight: 1.45,
                          bgcolor: panelEditorBg,
                          border: `1px solid ${panelBorder}`,
                          borderRadius: 0.5,
                          overflow: "hidden",
                          boxShadow: "none",
                        }}
                      >
                        <RichTextEditor
                          value={panelValue}
                          onChange={(nextValue) => onNotesChange(activeTab, nextValue, panel.id)}
                          placeholder={`Draft ${panel.label.toLowerCase()} here...`}
                          minHeight={220}
                          toolbarColor={panelText}
                          textColor={panelText}
                          surfaceColor="transparent"
                        />
                      </Box>
                    </Stack>
                  );
                })}
              </Stack>
            ) : (
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                fontFamily: GITHUB_FONT_STACK,
                fontSize: "0.875rem",
                lineHeight: 1.45,
                bgcolor:
                  activeTab === "Risks" || activeTab === "Exceeds MTS"
                    ? "transparent"
                    : panelEditorBg,
                border:
                  activeTab === "Risks" || activeTab === "Exceeds MTS"
                    ? "0"
                    : `1px solid ${panelBorder}`,
                borderRadius: 0.5,
                overflow: "hidden",
                mt: 0,
                boxShadow:
                  activeTab === "Risks" || activeTab === "Exceeds MTS"
                    ? "none"
                    : isLightMode
                      ? "0 1px 0 rgba(17,24,39,0.04), 0 3px 8px rgba(17,24,39,0.08)"
                      : "none",
              }}
            >
              {activeTab === "Risks" ? (
                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: "auto",
                    px: 0,
                    pt: 0.2,
                    pb: 0.8,
                    ...subtleScrollbarSx,
                  }}
                >
                  <Stack spacing={1.2}>
                    {riskEntries.length ? null : (
                      <Typography variant="body2" sx={{ color: panelMutedText, px: 0.4 }}>
                        No risks added yet. Use `Add Risk` to capture a risk and mitigation
                        for this section.
                      </Typography>
                    )}
                    {riskEntries.map((entry, index) => {
                      return (
                        <Paper
                          key={entry.id}
                          variant="outlined"
                          sx={{
                            position: "relative",
                            p: 0.9,
                            mx: 0,
                            fontFamily: GITHUB_FONT_STACK,
                            fontSize: "0.875rem",
                            lineHeight: 1.45,
                            borderRadius: 0.5,
                            bgcolor: panelEditorBg,
                            borderColor: "transparent",
                            boxShadow: "none",
                          }}
                        >
                          <IconButton
                            size="small"
                            onClick={() => openRiskDeleteDialog(entry.id)}
                            sx={{
                              position: "absolute",
                              top: 6,
                              right: 6,
                              width: 22,
                              height: 22,
                              color: panelMutedText,
                              bgcolor: "transparent",
                            }}
                          >
                            <CloseRounded sx={{ fontSize: 15 }} />
                          </IconButton>
                          <Stack spacing={1} sx={{ pr: 3.2 }}>
                            <Typography variant="body2" sx={{ color: panelText }}>
                              <Box component="span" sx={{ fontWeight: 600, color: "#ff4d4f" }}>Risk:</Box> {entry.risk}
                            </Typography>
                            <Typography variant="body2" sx={{ color: panelText }}>
                              <Box component="span" sx={{ fontWeight: 600 }}>Mitigation:</Box> {entry.mitigation}
                            </Typography>
                          </Stack>
                        </Paper>
                      );
                    })}
                  </Stack>
                </Box>
              ) : activeTab === "Exceeds MTS" ? (
                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: "auto",
                    px: 0,
                    pt: 0.2,
                    pb: 0.8,
                    ...subtleScrollbarSx,
                  }}
                >
                  <Stack spacing={1.2}>
                    {exceedsEntries.length ? null : (
                      <Typography variant="body2" sx={{ color: panelMutedText, px: 0.4 }}>
                        No exceeds elements added yet. Use `Add Exceeds Element` to capture
                        discriminators that go beyond the minimum requirement.
                      </Typography>
                    )}
                    {exceedsEntries.map((entry) => (
                      <Paper
                        key={entry.id}
                        variant="outlined"
                        sx={{
                          position: "relative",
                          p: 0.9,
                          mx: 0,
                          fontFamily: GITHUB_FONT_STACK,
                          fontSize: "0.875rem",
                          lineHeight: 1.45,
                          borderRadius: 0.5,
                          bgcolor: panelEditorBg,
                          borderColor: "transparent",
                          boxShadow: "none",
                        }}
                      >
                        <IconButton
                          size="small"
                          onClick={() => openExceedsDeleteDialog(entry.id)}
                          sx={{
                            position: "absolute",
                            top: 6,
                            right: 6,
                            width: 22,
                            height: 22,
                            color: panelMutedText,
                            bgcolor: "transparent",
                          }}
                        >
                          <CloseRounded sx={{ fontSize: 15 }} />
                        </IconButton>
                        <Stack spacing={1} sx={{ pr: 3.2 }}>
                          <Typography variant="body2" sx={{ color: panelText }}>
                            <Box component="span" sx={{ fontWeight: 600, color: "#58a6ff" }}>
                              Exceeds Element:
                            </Box>{" "}
                            {entry.element}
                          </Typography>
                          <Typography variant="body2" sx={{ color: panelText }}>
                            <Box component="span" sx={{ fontWeight: 600 }}>
                              Why it exceeds:
                            </Box>{" "}
                            {entry.rationale}
                          </Typography>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                </Box>
              ) : (
                <RichTextEditor
                  value={notesByTab[activeTab] || ""}
                  onChange={(nextValue) => onNotesChange(activeTab, nextValue)}
                  placeholder={`Draft the ${activeTab} content here...`}
                  minHeight={320}
                  toolbarColor={panelText}
                  textColor={panelText}
                  surfaceColor="transparent"
                />
              )}
            </Box>
            )}
          </Box>
        </Stack>
      </Box>
      <Dialog open={riskDialogOpen} onClose={closeRiskDialog} fullWidth maxWidth="sm">
        <DialogTitle>Add Risk</DialogTitle>
        <DialogContent>
          <Stack spacing={1.25} sx={{ pt: 0.5 }}>
            <TextField
              fullWidth
              required
              label="Risk"
              placeholder="Describe the risk event or condition."
              value={riskDraft.risk}
              onChange={(event) => updateRiskDraft("risk", event.target.value)}
            />
            <TextField
              fullWidth
              required
              label="Mitigation"
              placeholder="Describe the mitigation approach."
              value={riskDraft.mitigation}
              onChange={(event) => updateRiskDraft("mitigation", event.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRiskDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={saveRiskDraft}
            disabled={!riskDraft.risk.trim() || !riskDraft.mitigation.trim()}
          >
            Add Risk
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(riskDeleteId)} onClose={closeRiskDeleteDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Risk</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to delete this risk?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRiskDeleteDialog}>Cancel</Button>
          <Button onClick={confirmRiskDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={exceedsDialogOpen} onClose={closeExceedsDialog} fullWidth maxWidth="sm">
        <DialogTitle>Add Exceeds Element</DialogTitle>
        <DialogContent>
          <Stack spacing={1.25} sx={{ pt: 0.5 }}>
            <TextField
              fullWidth
              required
              label="Solution Element"
              placeholder="Describe the differentiator."
              value={exceedsDraft.element}
              onChange={(event) => updateExceedsDraft("element", event.target.value)}
            />
            <TextField
              fullWidth
              required
              multiline
              minRows={3}
              label="Why It Exceeds"
              placeholder="Explain why this goes beyond the minimum."
              value={exceedsDraft.rationale}
              onChange={(event) => updateExceedsDraft("rationale", event.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeExceedsDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={saveExceedsDraft}
            disabled={!exceedsDraft.element.trim() || !exceedsDraft.rationale.trim()}
          >
            Add Element
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(exceedsDeleteId)}
        onClose={closeExceedsDeleteDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete Exceeds Element</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to delete this exceeds element?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeExceedsDeleteDialog}>Cancel</Button>
          <Button onClick={confirmExceedsDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export function StudioApp() {
  const { mode, toggleMode } = useStudioThemeMode();
  const middleCanvasBg = mode === "light" ? "#b7c1cb" : GITHUB_SURFACE;
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
  const [mtsPromptTargetPanelId, setMtsPromptTargetPanelId] = useState(MTS_DEFINITION_PANELS[0].id);
  const [homeDialogOpen, setHomeDialogOpen] = useState(false);
  const [mtsConfirmDialog, setMtsConfirmDialog] = useState({
    open: false,
    action: "",
    panelId: "",
  });
  const [activeSectionId, setActiveSectionId] = useState("");
  const [selectedRequirementId, setSelectedRequirementId] = useState("");
  const [uploadState, setUploadState] = useState({
    loading: false,
    error: "",
  });
  const [mtsDefinitionGenerationState, setMtsDefinitionGenerationState] = useState({
    loading: "",
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
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
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
  const activeSectionMtsPrompts = useMemo(() => {
    const sectionLabel = activeSection?.label || "this section";
    return normalizeMtsPromptSet(
      activeSection?.id ? stormWorkspacePrompts[activeSection.id] : {},
      sectionLabel,
    );
  }, [activeSection, stormWorkspacePrompts]);
  const activeSectionDefinitionPanels = useMemo(
    () => parseMtsDefinitionPanels(activeSectionStormWorkspaceNotes["MTS Definition"]),
    [activeSectionStormWorkspaceNotes],
  );
  const completedStormSectionIds = useMemo(() => {
    return new Set(
      Object.entries(stormWorkspaceNotes).flatMap(([sectionId, notes]) => {
        const isComplete = STORM_WORKSPACE_TABS.every(
          (tab) =>
            tab === "MTS Definition"
              ? MTS_DEFINITION_PANELS.every(
                  (panel) => String(parseMtsDefinitionPanels(notes?.[tab])?.[panel.id] || "").trim().length > 0,
                )
              : String(notes?.[tab] || "").trim().length > 0,
        );
        return isComplete ? [sectionId] : [];
      }),
    );
  }, [stormWorkspaceNotes]);
  const currentProjectLabel = useMemo(() => {
    if (!workspace.projectId) {
      return "";
    }

    const matchingProject = availablePackageProjects.find(
      (project) => project?.project_id === workspace.projectId,
    );

    return (
      String(
        matchingProject?.display_name ||
          matchingProject?.project_id ||
          workspace.projectId,
      ).trim() || ""
    );
  }, [availablePackageProjects, workspace.projectId]);
  const currentWorkLabel = useMemo(() => {
    return String(
      workspace.sourceFilename ||
        workspace.sourceFormat ||
        "PWS",
    ).trim();
  }, [workspace.sourceFilename, workspace.sourceFormat]);

  const isHomeScreen = !sections.length;

  function buildStudioSnapshot() {
    return {
      workspace,
      activeSectionId,
      selectedRequirementId,
      stormWorkspaceTab,
      stormWorkspaceNotes,
      stormWorkspacePrompts,
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
    setCollapsedRequirementIds(new Set());
    setUploadState({ loading: false, error: "" });
    setSelectedPackageProjectId("");
    setProjectSetupState({ loading: false, error: "", jobId: "", message: "" });
    setProjectSetupProgress(0);
    setMtsDefinitionGenerationState({ loading: "", error: "" });
  }

  function restoreStudioSnapshot(snapshot, options = {}) {
    const resetHistory = options.resetHistory ?? true;
    setWorkspace(snapshot?.workspace ? snapshot.workspace : buildEmptyWorkspace());
    if (resetHistory) {
      setUndoHistory([]);
      setRedoHistory([]);
    }
    setActiveSectionId(typeof snapshot?.activeSectionId === "string" ? snapshot.activeSectionId : "");
    setSelectedRequirementId(
      typeof snapshot?.selectedRequirementId === "string" ? snapshot.selectedRequirementId : "",
    );
    setStormWorkspaceTab(
      typeof snapshot?.stormWorkspaceTab === "string"
        ? snapshot.stormWorkspaceTab === "STORM"
          ? "MTS Solution"
          : snapshot.stormWorkspaceTab
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
    setMtsDefinitionGenerationState({ loading: "", error: "" });
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
    setMtsDefinitionGenerationState({ loading: "", error: "" });
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
    leftRailWidth,
    rightRailWidth,
    leftRailCollapsed,
    rightRailCollapsed,
  ]);

  useEffect(() => {
    if (!mounted || (!sections.length && !requirements.length)) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const snapshot = buildStudioSnapshot();
      setSavedProjects((current) => {
        const nextProject = {
          id: AUTOSAVE_PROJECT_ID,
          name: AUTOSAVE_PROJECT_NAME,
          savedAt: new Date().toISOString(),
          snapshot,
        };
        const remaining = current.filter((project) => project.id !== AUTOSAVE_PROJECT_ID);
        return [nextProject, ...remaining].sort((left, right) =>
          right.savedAt.localeCompare(left.savedAt),
        );
      });
    }, AUTOSAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    mounted,
    sections.length,
    requirements.length,
    workspace,
    activeSectionId,
    selectedRequirementId,
    stormWorkspaceTab,
    stormWorkspaceNotes,
    stormWorkspacePrompts,
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
  const rightRailDisplayWidth = rightRailWidth;
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

  function selectSection(sectionId) {
    recordStudioHistorySnapshot();
    setActiveSectionId(sectionId);
    const firstRequirement = getSectionRoots(requirements, sectionId)[0];
    if (firstRequirement) {
      setSelectedRequirementId(firstRequirement.id);
    }
  }

  function selectRequirement(requirementId) {
    recordStudioHistorySnapshot();
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

  function recordStudioHistorySnapshot() {
    pushHistorySnapshot(setUndoHistory, buildStudioSnapshot());
    setRedoHistory([]);
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

    recordStudioHistorySnapshot();
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
    pushHistorySnapshot(setRedoHistory, buildStudioSnapshot());
    restoreStudioSnapshot(latestSnapshot, { resetHistory: false });
  }

  function handleRedo() {
    if (!redoHistory.length) {
      return;
    }

    const [latestSnapshot, ...remainingHistory] = redoHistory;
    setRedoHistory(remainingHistory);
    pushHistorySnapshot(setUndoHistory, buildStudioSnapshot());
    restoreStudioSnapshot(latestSnapshot, { resetHistory: false });
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

    const requirementId = selectedRequirement.id;
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

    applyWorkspaceChange((current) => {
      const targetRequirement = getRequirementById(current.requirements, requirementId);
      if (!targetRequirement) {
        return current;
      }

      return {
        ...current,
        sections: [...current.sections, nextSection],
        requirements: reassignRequirement(
          current.requirements,
          requirementId,
          nextSection.id,
        ),
      };
    }, {
      nextActiveSectionId: nextSection.id,
      nextSelectedRequirementId: requirementId,
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

  function handleOpenExportDialog() {
    setExportDialogOpen(true);
  }

  function handleCloseExportDialog() {
    setExportDialogOpen(false);
  }

  function handleExportSectionDoc() {
    if (!activeSection) {
      return;
    }

    const html = buildSectionExportHtml({
      projectLabel: currentProjectLabel,
      section: activeSection,
      requirementsScope: activeSectionRequirements,
      stormNotes: activeSectionStormWorkspaceNotes,
      definitionPanels: activeSectionDefinitionPanels,
    });
    const blob = new Blob([`\ufeff${html}`], {
      type: "application/msword;charset=utf-8",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stormstudio-${slugifyExportName(activeSection.label)}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    setExportDialogOpen(false);
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

  function handleStormWorkspaceNoteChange(tab, value, panelId = "") {
    if (!activeSection?.id) {
      return;
    }

    recordStudioHistorySnapshot();
    setStormWorkspaceNotes((current) => ({
      ...current,
      [activeSection.id]: {
        ...buildEmptyStormWorkspace(),
        ...(current[activeSection.id] || {}),
        [tab]:
          tab === "MTS Definition" && panelId
            ? serializeMtsDefinitionPanels({
                ...parseMtsDefinitionPanels(current[activeSection.id]?.[tab]),
                [panelId]: value,
              })
            : value,
      },
    }));
  }

  function handleClearStormWorkspaceTab(panelId = "") {
    if (!activeSection?.id) {
      return;
    }

    recordStudioHistorySnapshot();
    setStormWorkspaceNotes((current) => ({
      ...current,
      [activeSection.id]: {
        ...buildEmptyStormWorkspace(),
        ...(current[activeSection.id] || {}),
        [stormWorkspaceTab]:
          stormWorkspaceTab === "MTS Definition" && panelId
            ? serializeMtsDefinitionPanels({
                ...parseMtsDefinitionPanels(current[activeSection.id]?.[stormWorkspaceTab]),
                [panelId]: "",
              })
            : "",
      },
    }));
  }

  function handleOpenMtsConfirm(action, panelId = "") {
    const currentTabText =
      stormWorkspaceTab === "MTS Definition" && panelId
        ? String(activeSectionDefinitionPanels[panelId] || "").trim()
        : String(activeSectionStormWorkspaceNotes[stormWorkspaceTab] || "").trim();
    if (!currentTabText) {
      if (action === "clear") {
        handleClearStormWorkspaceTab(panelId);
        return;
      }

      if (action === "generate") {
        void handleGenerateMtsDefinition(panelId);
        return;
      }
    }

    setMtsConfirmDialog({
      open: true,
      action,
      panelId,
    });
  }

  function handleCloseMtsConfirm() {
    setMtsConfirmDialog({
      open: false,
      action: "",
      panelId: "",
    });
  }

  async function handleConfirmMtsAction() {
    const action = mtsConfirmDialog.action;
    const panelId = mtsConfirmDialog.panelId;
    handleCloseMtsConfirm();

    if (action === "clear") {
      handleClearStormWorkspaceTab(panelId);
      return;
    }

    if (action === "generate") {
      await handleGenerateMtsDefinition(panelId);
    }
  }

  function handleEditMtsPrompt(panelId) {
    if (!activeSection?.id) {
      return;
    }
    const nextPanelId = panelId || MTS_DEFINITION_PANELS[0].id;
    setMtsPromptTargetPanelId(nextPanelId);
    setMtsPromptDraft(activeSectionMtsPrompts[nextPanelId] || "");
    setMtsPromptDialogOpen(true);
  }

  function handleCloseMtsPromptDialog() {
    setMtsPromptDialogOpen(false);
  }

  function handleUseDefaultMtsPrompt() {
    const sectionLabel = activeSection?.label || "this section";
    const activePanel =
      MTS_DEFINITION_PANELS.find((panel) => panel.id === mtsPromptTargetPanelId) ||
      MTS_DEFINITION_PANELS[0];
    setMtsPromptDraft(buildDefaultMtsDefinitionPanelPrompt(sectionLabel, activePanel.label));
  }

  function handleSaveMtsPrompt() {
    if (!activeSection?.id) {
      return;
    }

    const trimmedPrompt = mtsPromptDraft.trim();
    if (!trimmedPrompt) {
      return;
    }

    recordStudioHistorySnapshot();
    setStormWorkspacePrompts((current) => ({
      ...current,
      [activeSection.id]: {
        ...normalizeMtsPromptSet(current[activeSection.id], activeSection.label),
        [mtsPromptTargetPanelId]: trimmedPrompt,
      },
    }));
    setMtsPromptDialogOpen(false);
  }

  function buildStormGenerationRequirements() {
    return activeSectionRequirements.map(({ requirement }) => {
      const sourceLabel = String(requirement.sourceRef || "").trim();
      const titleLabel = String(requirement.title || "").trim();
      const summaryText = String(
        requirement.text || requirement.summary || requirement.title || "",
      ).trim();
      const combinedText = [sourceLabel, titleLabel, summaryText]
        .filter(Boolean)
        .join("\n");

      return {
        id: sourceLabel || titleLabel || requirement.id,
        section: activeSection.label,
        text: combinedText,
      };
    });
  }

  async function handleGenerateMtsDefinition(panelId = MTS_DEFINITION_PANELS[0].id) {
    if (!activeSection || !activeSectionRequirements.length) {
      setMtsDefinitionGenerationState({
        loading: "",
        error: "Select a section that has requirements before generating.",
      });
      return;
    }

    const targetPanelId = panelId || MTS_DEFINITION_PANELS[0].id;
    setMtsDefinitionGenerationState({ loading: targetPanelId, error: "" });
    setStormWorkspaceTab("MTS Definition");
    setStormWorkspaceNotes((current) => ({
      ...current,
      [activeSection.id]: {
        ...buildEmptyStormWorkspace(),
        ...(current[activeSection.id] || {}),
        ["MTS Definition"]: serializeMtsDefinitionPanels({
          ...parseMtsDefinitionPanels(current[activeSection.id]?.["MTS Definition"]),
          [targetPanelId]: "",
        }),
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
          prompt: activeSectionMtsPrompts[targetPanelId],
          requirements: buildStormGenerationRequirements(),
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

      const commitDefinition = (nextDefinition) => {
        setStormWorkspaceNotes((current) => ({
          ...current,
          [activeSection.id]: {
            ...buildEmptyStormWorkspace(),
            ...(current[activeSection.id] || {}),
            ["MTS Definition"]: serializeMtsDefinitionPanels({
              ...parseMtsDefinitionPanels(current[activeSection.id]?.["MTS Definition"]),
              [targetPanelId]: nextDefinition,
            }),
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
          commitDefinition(convertStreamingStormTextToHtml(streamedDefinition));
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

      commitDefinition(convertGeneratedStormTextToHtml(streamedDefinition));

      setMtsDefinitionGenerationState({ loading: "", error: "" });
    } catch (error) {
      setMtsDefinitionGenerationState({
        loading: "",
        error: error instanceof Error ? error.message : "MTS definition generation failed",
      });
    }
  }

  async function handleGenerateMtsSolution() {
    if (!activeSection || !activeSectionRequirements.length) {
      setMtsDefinitionGenerationState({
        loading: "",
        error: "Select a section that has requirements before generating.",
      });
      return;
    }

    setMtsDefinitionGenerationState({ loading: "MTS Solution", error: "" });
    setStormWorkspaceTab("MTS Solution");
    setStormWorkspaceNotes((current) => ({
      ...current,
      [activeSection.id]: {
        ...buildEmptyStormWorkspace(),
        ...(current[activeSection.id] || {}),
        ["MTS Solution"]: "",
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
          prompt: activeSectionMtsPrompts["MTS Solution"],
          requirements: buildStormGenerationRequirements(),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "MTS solution generation failed");
      }

      if (!response.body) {
        throw new Error("MTS solution stream was unavailable");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventType = "message";
      let streamedContent = "";

      const commitSolution = (nextContent) => {
        setStormWorkspaceNotes((current) => ({
          ...current,
          [activeSection.id]: {
            ...buildEmptyStormWorkspace(),
            ...(current[activeSection.id] || {}),
            ["MTS Solution"]: nextContent,
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
          streamedContent += String(parsed?.delta || "");
          commitSolution(convertStreamingStormTextToHtml(streamedContent));
          return;
        }

        if (nextEventType === "error") {
          let detail = String(parsed?.detail || "").trim();
          try {
            const nested = JSON.parse(detail);
            detail = String(nested?.detail || detail).trim();
          } catch {}
          throw new Error(detail || "MTS solution generation failed");
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

      if (!streamedContent.trim() && eventType !== "done") {
        throw new Error("MTS solution generation returned no content");
      }

      commitSolution(convertGeneratedStormTextToHtml(streamedContent));

      setMtsDefinitionGenerationState({ loading: "", error: "" });
    } catch (error) {
      setMtsDefinitionGenerationState({
        loading: "",
        error: error instanceof Error ? error.message : "MTS solution generation failed",
      });
    }
  }

  async function handleGenerateRisks() {
    if (!activeSection || !activeSectionRequirements.length) {
      setMtsDefinitionGenerationState({
        loading: "",
        error: "Select a section that has requirements before generating.",
      });
      return;
    }

    setMtsDefinitionGenerationState({ loading: "Risks", error: "" });
    setStormWorkspaceTab("Risks");

    try {
      const response = await fetch("/api/storm/mts-definition", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sectionLabel: activeSection.label,
          prompt: buildDefaultRiskGenerationPrompt(activeSection.label),
          requirements: buildStormGenerationRequirements(),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "Risk generation failed");
      }

      if (!response.body) {
        throw new Error("Risk generation stream was unavailable");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventType = "message";
      let streamedContent = "";

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
          streamedContent += String(parsed?.delta || "");
          return;
        }

        if (nextEventType === "error") {
          let detail = String(parsed?.detail || "").trim();
          try {
            const nested = JSON.parse(detail);
            detail = String(nested?.detail || detail).trim();
          } catch {}
          throw new Error(detail || "Risk generation failed");
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

      const generatedRisks = parseGeneratedRiskRegister(streamedContent);
      if (!generatedRisks.length && eventType !== "done") {
        throw new Error("Risk generation returned no content");
      }
      if (!generatedRisks.length) {
        throw new Error("Risk generation did not return any structured risks");
      }

      setStormWorkspaceNotes((current) => {
        const existingRisks = parseRiskRegister(current[activeSection.id]?.Risks);
        const nextRisks = [...existingRisks, ...generatedRisks].slice(0, 3);

        return {
          ...current,
          [activeSection.id]: {
            ...buildEmptyStormWorkspace(),
            ...(current[activeSection.id] || {}),
            Risks: serializeRiskRegister(nextRisks),
          },
        };
      });

      setMtsDefinitionGenerationState({ loading: "", error: "" });
    } catch (error) {
      setMtsDefinitionGenerationState({
        loading: "",
        error: error instanceof Error ? error.message : "Risk generation failed",
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

    const defaultName = workspace.sourceFilename || "StormStudio Project";
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
          borderBottom: "1px solid var(--studio-appbar-border)",
          backdropFilter: "none",
          bgcolor: "#223b54",
          pl: 0,
          pr: 0,
          py: 0,
          transition: "padding 180ms ease",
          boxShadow: "none",
          flexShrink: 0,
        }}
      >
        <Toolbar
          disableGutters
          sx={{
            minHeight: "40px !important",
            height: 40,
            py: 0,
            pl: { xs: 0.9, xl: 1.2 },
            pr: { xs: 0.45, xl: 0.6 },
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Box sx={{ flexGrow: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 1.4 }}>
            <Typography
              variant="h5"
              sx={{
                color: "var(--studio-title)",
                fontWeight: 400,
                letterSpacing: -0.02,
                lineHeight: 1,
                fontSize: "1.08rem",
                flexShrink: 0,
              }}
            >
              StormStudio
            </Typography>
            {!isHomeScreen ? (
              <Stack
                direction="row"
                spacing={1.1}
                alignItems="center"
                sx={{ minWidth: 0, overflow: "hidden" }}
              >
                {currentProjectLabel ? (
                  <Typography
                    variant="body2"
                    sx={{
                      color: "rgba(230, 237, 243, 0.88)",
                      fontSize: "0.8rem",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    Project: {currentProjectLabel}
                  </Typography>
                ) : null}
                {currentWorkLabel ? (
                  <Typography
                    variant="body2"
                    sx={{
                      color: "rgba(230, 237, 243, 0.66)",
                      fontSize: "0.8rem",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    Working: {currentWorkLabel}
                  </Typography>
                ) : null}
              </Stack>
            ) : null}
          </Box>
          {!isHomeScreen ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                minWidth: 0,
                overflowX: "auto",
                py: 0.1,
                ...subtleScrollbarSx,
              }}
            >
              <Button
                variant="text"
                startIcon={mode === "dark" ? <LightModeRounded /> : <DarkModeRounded />}
                onClick={toggleMode}
                sx={RIBBON_TOOL_BUTTON_SX}
              >
                {mode === "dark" ? "Light Mode" : "Dark Mode"}
              </Button>
              <Button
                variant="text"
                startIcon={<UndoRounded />}
                onClick={handleUndo}
                disabled={!undoHistory.length}
                sx={RIBBON_TOOL_BUTTON_SX}
              >
                Undo
              </Button>
              <Button
                variant="text"
                startIcon={<RedoRounded />}
                onClick={handleRedo}
                disabled={!redoHistory.length}
                sx={RIBBON_TOOL_BUTTON_SX}
              >
                Redo
              </Button>
              <Button
                variant="text"
                startIcon={<SaveRounded />}
                onClick={handleSaveProject}
                disabled={!sections.length}
                sx={RIBBON_TOOL_BUTTON_SX}
              >
                Save Project
              </Button>
              <Button
                variant="text"
                startIcon={<PlaylistAddRounded />}
                onClick={handleOpenReqImportDialog}
                sx={RIBBON_TOOL_BUTTON_SX}
              >
                Import Reqs
              </Button>
              <Button
                variant="text"
                startIcon={<DownloadRounded />}
                onClick={handleOpenExportDialog}
                disabled={!activeSection || !sections.length}
                sx={RIBBON_TOOL_BUTTON_SX}
              >
                Export
              </Button>
              <Button
                variant="text"
                startIcon={<HomeRounded />}
                onClick={handleGoHome}
                sx={RIBBON_TOOL_BUTTON_SX}
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
            title="Sections"
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

            <Box sx={{ minHeight: 0 }}>
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
                      mt: 0.7,
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
                        completed={completedStormSectionIds.has(section.id)}
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
                          completed={completedStormSectionIds.has("unassigned")}
                        />
                      </ListItemButton>
                    ) : null}
                  </List>
                </SortableContext>
              </DndContext>
            </Box>
            <Stack spacing={1.1} sx={{ pt: 1.1 }}>
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
            bgcolor: middleCanvasBg,
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
            px: isHomeScreen ? 3 : { xs: 0.5, xl: 0.45 },
            pt: isHomeScreen ? 3 : { xs: 0.18, xl: 0.08 },
            pb: isHomeScreen ? 3 : { xs: 0.5, xl: 0.35 },
            display: "flex",
            alignItems: isHomeScreen ? "center" : "stretch",
            justifyContent: isHomeScreen ? "center" : "flex-start",
            bgcolor: isHomeScreen ? "transparent" : middleCanvasBg,
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
                  StormStudio is running the structuring pipeline and converting the result
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
                  bgcolor: middleCanvasBg,
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
        </Box>

        {!isHomeScreen ? (
          <RailShell
            side="right"
            title=""
            subtitle=""
            width={rightRailDisplayWidth}
            collapsed={false}
            onToggleCollapsed={() => {}}
            onResizeStart={startRailResize("right")}
            hideHeader
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
              sectionSolutionPanel={
                <StormWorkspaceBar
                  activeTab={stormWorkspaceTab}
                  onTabChange={setStormWorkspaceTab}
                  notesByTab={activeSectionStormWorkspaceNotes}
                  onNotesChange={handleStormWorkspaceNoteChange}
                  onGenerateMtsDefinition={(panelId) => handleOpenMtsConfirm("generate", panelId)}
                  onGenerateMtsSolution={handleGenerateMtsSolution}
                  onGenerateRisks={handleGenerateRisks}
                  onClearActiveTab={() => handleOpenMtsConfirm("clear")}
                  onEditMtsPrompt={handleEditMtsPrompt}
                  generationState={mtsDefinitionGenerationState}
                  activeSection={activeSection}
                  activeSectionRequirementCount={activeSectionRequirements.length}
                  definitionPanels={activeSectionDefinitionPanels}
                  definitionPrompts={activeSectionMtsPrompts}
                  hideCollapseToggle
                />
              }
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
        <DialogTitle>
          Edit{" "}
          {(
            MTS_DEFINITION_PANELS.find((panel) => panel.id === mtsPromptTargetPanelId) ||
            MTS_DEFINITION_PANELS[0]
          ).label}{" "}
          Prompt
        </DialogTitle>
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
            placeholder="Enter the prompt used when generating this definition box."
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
          <Button onClick={handleUseDefaultMtsPrompt}>Use Default</Button>
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
      <Dialog open={mtsConfirmDialog.open} onClose={handleCloseMtsConfirm} maxWidth="xs" fullWidth>
        <DialogTitle>
          {mtsConfirmDialog.action === "generate" ? "Re-run Generate?" : "Clear This Box?"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {mtsConfirmDialog.action === "generate"
              ? "This box already has text. Do you want to replace it with a new AI definition?"
              : "This box already has text. Do you want to clear it?"}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseMtsConfirm}>Cancel</Button>
          <Button onClick={handleConfirmMtsAction} variant="contained">
            Continue
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
      <Dialog open={exportDialogOpen} onClose={handleCloseExportDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Export Word Doc</DialogTitle>
        <DialogContent>
          <Stack spacing={1.25} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Export the current section as a Word-compatible document with its middle-pane
              requirements and STORM content.
            </Typography>
            <Typography variant="body2">
              <strong>Section:</strong> {activeSection?.label || "No section selected"}
            </Typography>
            <Typography variant="body2">
              <strong>Requirements:</strong> {activeSectionRequirements.length}
            </Typography>
            <Typography variant="body2">
              <strong>Includes:</strong> MTS Definition, MTS Solution, Exceeds MTS, and Risks
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseExportDialog}>Cancel</Button>
          <Button onClick={handleExportSectionDoc} variant="contained" disabled={!activeSection}>
            Export .doc
          </Button>
        </DialogActions>
      </Dialog>
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
              <Typography variant="body2" sx={{ fontWeight: 600, color: "var(--studio-text)" }}>
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
                bgcolor: "var(--studio-selection-soft)",
              }}
            />
          </Stack>
        </Paper>
      ) : null}
    </Box>
  );
}
