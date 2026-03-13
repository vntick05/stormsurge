"use client";

import { useEffect, useMemo, useState } from "react";
import CloudUploadRounded from "@mui/icons-material/CloudUploadRounded";
import CreateNewFolderRounded from "@mui/icons-material/CreateNewFolderRounded";
import HubRounded from "@mui/icons-material/HubRounded";
import InsightsRounded from "@mui/icons-material/InsightsRounded";
import {
  Alert,
  AppBar,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
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

const DRAWER_WIDTH = 360;

function buildEmptyWorkspace() {
  return {
    sections: [],
    requirements: [],
    sourceFilename: null,
    sourceFormat: null,
  };
}

export function StudioApp() {
  const [mounted, setMounted] = useState(false);
  const [workspace, setWorkspace] = useState(buildEmptyWorkspace);
  const [activeSectionId, setActiveSectionId] = useState("");
  const [selectedRequirementId, setSelectedRequirementId] = useState("");
  const [uploadState, setUploadState] = useState({
    loading: false,
    error: "",
  });
  const [newSectionLabel, setNewSectionLabel] = useState("");

  const sections = workspace.sections;
  const requirements = workspace.requirements;
  const activeSection =
    sections.find((section) => section.id === activeSectionId) ?? sections[0] ?? null;
  const selectedRequirement = getRequirementById(requirements, selectedRequirementId);
  const activeRequirements = activeSection
    ? requirements.filter((requirement) => requirement.sectionId === activeSection.id)
    : [];
  const unassignedRequirements = getSectionRoots(requirements, "unassigned");

  const workspaceStats = useMemo(() => {
    const extractedCount = requirements.filter(
      (requirement) => requirement.sourceType === "extracted",
    ).length;
    const manualCount = requirements.filter(
      (requirement) => requirement.sourceType === "manual",
    ).length;
    return {
      sections: sections.length,
      requirements: requirements.length,
      extractedCount,
      manualCount,
    };
  }, [requirements, sections.length]);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    if (requirement && requirement.sectionId !== "unassigned") {
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
    if (!activeSection) {
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

  function handleCreateSection() {
    const label = newSectionLabel.trim() || `Custom Section ${sections.length + 1}`;
    const shortLabel = label
      .split(/\s+/)
      .map((token) => token[0])
      .join("")
      .slice(0, 4)
      .toUpperCase();
    const nextSection = {
      id: `custom-${Date.now()}`,
      label,
      shortLabel: shortLabel || "CUST",
      prompt: "Use this lane for custom grouped requirements and solution framing.",
      description:
        "Custom sections let you reorganize extracted material outside the original PWS shape.",
      sourceKind: "manual",
      sectionNumber: null,
    };

    setWorkspace((current) => ({
      ...current,
      sections: [...current.sections, nextSection],
    }));
    setActiveSectionId(nextSection.id);
    setNewSectionLabel("");
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
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="fixed"
        color="transparent"
        elevation={0}
        sx={{
          width: `calc(100% - ${DRAWER_WIDTH}px)`,
          ml: `${DRAWER_WIDTH}px`,
          borderBottom: 1,
          borderColor: "divider",
          backdropFilter: "blur(14px)",
          bgcolor: "rgba(247, 249, 252, 0.84)",
        }}
      >
        <Toolbar sx={{ gap: 2, minHeight: 80 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="overline" color="text.secondary">
              StormSurge Studio
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              PWS Architecture Workspace
            </Typography>
          </Box>
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

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            borderRight: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
            backgroundImage:
              "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(241,244,249,0.96))",
          },
        }}
      >
        <Toolbar sx={{ minHeight: 80 }} />
        <Box sx={{ p: 2, display: "grid", gap: 2 }}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Intake
            </Typography>
            <Typography variant="h6" sx={{ mt: 0.5 }}>
              Upload and organize a PWS
            </Typography>
          </Box>

          <UploadWorkspaceCard
            loading={uploadState.loading}
            onUpload={handleOutlineUpload}
          />

          {uploadState.error ? <Alert severity="error">{uploadState.error}</Alert> : null}

          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
              <HubRounded color="primary" />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Section Tabs
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Each imported top-level PWS section becomes a working tab. Add your own
              tabs when you want to regroup the hierarchy into proposal-oriented lanes.
            </Typography>
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                fullWidth
                placeholder="New tab name"
                value={newSectionLabel}
                onChange={(event) => setNewSectionLabel(event.target.value)}
              />
              <Tooltip title="Add custom section tab">
                <span>
                  <IconButton color="primary" onClick={handleCreateSection}>
                    <CreateNewFolderRounded />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </Paper>

          <Box>
            <Typography variant="overline" color="text.secondary">
              Workspace
            </Typography>
            <List sx={{ mt: 1, border: 1, borderColor: "divider", borderRadius: 3, p: 1 }}>
              {sections.map((section) => {
                const count = requirements.filter(
                  (requirement) => requirement.sectionId === section.id,
                ).length;
                const selected = section.id === activeSectionId;
                return (
                  <ListItemButton
                    key={section.id}
                    selected={selected}
                    onClick={() => selectSection(section.id)}
                    sx={{ borderRadius: 2, mb: 0.5 }}
                  >
                    <ListItemText
                      primary={section.label}
                      secondary={`${section.shortLabel} · ${count} nodes`}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          pl: { xs: 0.375, md: 0.5, xl: 0.75 },
          pr: { xs: 0.75, md: 1, xl: 1.25 },
          py: 2,
        }}
      >
        <Toolbar sx={{ minHeight: 80 }} />
        <Stack spacing={3}>
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              borderRadius: 4,
              background:
                "linear-gradient(135deg, rgba(10,98,168,0.08), rgba(255,255,255,0.92))",
            }}
          >
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center">
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="overline" color="text.secondary">
                  Modern Workspace
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                  Drag the hierarchy, retain the ingest
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  The new React studio now keeps the PWS upload path and turns extracted
                  sections into section tabs. Within each tab, the hierarchy is editable
                  and sibling nodes can be reordered by drag handle.
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip label={`${workspaceStats.extractedCount} extracted`} color="primary" />
                <Chip label={`${workspaceStats.manualCount} manual`} color="secondary" />
                <Chip label={workspace.sourceFormat || "No ingest yet"} variant="outlined" />
              </Stack>
            </Stack>
          </Paper>

          {uploadState.loading ? (
            <Paper variant="outlined" sx={{ p: 6, borderRadius: 4 }}>
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
            <Paper variant="outlined" sx={{ p: 6, borderRadius: 4 }}>
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
            <Stack direction={{ xs: "column", xl: "row" }} spacing={1} alignItems="stretch">
              <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
                <WorkspaceCanvas
                  section={activeSection}
                  requirements={activeRequirements}
                  allRequirements={requirements}
                  unassignedRequirements={unassignedRequirements}
                  selectedRequirementId={selectedRequirementId}
                  onCreateRequirement={handleCreateTopLevelRequirement}
                  onReorderRequirements={handleReorderRequirements}
                  onSelectRequirement={selectRequirement}
                />
              </Box>

              <Box sx={{ width: { xs: "100%", xl: 300 }, flexShrink: 0 }}>
                <DetailInspector
                  section={activeSection}
                  requirement={selectedRequirement}
                  sections={sections}
                  onCreateChildRequirement={handleCreateChildRequirement}
                  onRequirementChange={handleRequirementChange}
                  onAssignToSection={handleAssignToActiveSection}
                  onMoveRequirement={handleMoveRequirement}
                  onMoveToUnassigned={handleMoveToUnassigned}
                  onPromoteRequirement={handlePromoteRequirement}
                  onDemoteRequirement={handleDemoteRequirement}
                />
              </Box>
            </Stack>
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
    </Box>
  );
}
