"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PlaylistAddRounded from "@mui/icons-material/PlaylistAddRounded";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import AddRounded from "@mui/icons-material/AddRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import EditNoteRounded from "@mui/icons-material/EditNoteRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import { RichTextContent, hasTableBlock } from "@/components/rich-text-content";

const INSPECTOR_TABS = ["STORM", "Edit", "Search", "AI Helper"];
const INSPECTOR_TAB_ACCENTS = {
  Edit: "#f78166",
  Search: "#58a6ff",
  "AI Helper": "#3fb950",
  STORM: "#2ef2ff",
};
const INSPECTOR_TAB_ICONS = {
  STORM: AutoAwesomeRounded,
  Edit: EditNoteRounded,
  Search: SearchRounded,
  "AI Helper": AutoAwesomeRounded,
};
const GITHUB_BASE = "var(--studio-base)";
const GITHUB_SURFACE = "var(--studio-surface)";
const GITHUB_PANEL = "var(--studio-panel)";
const GITHUB_PANEL_HOVER = "var(--studio-panel-hover)";
const GITHUB_BORDER = "var(--studio-border)";
const GITHUB_TEXT_MUTED = "var(--studio-chrome-text)";
const INSPECTOR_TEXT = "var(--studio-chrome-text)";
const AI_ACTION = "#c678dd";

export function DetailInspector({
  projectId,
  section,
  requirement,
  sectionRequirements,
  allRequirements,
  sections,
  hasCollapsibleRequirements,
  onSelectRequirement,
  onCreateTopLevelRequirement,
  onCreateChildRequirement,
  onExpandAllRequirements,
  onCollapseAllRequirements,
  onRequirementChange,
  onAssignToSection,
  onMoveRequirement,
  onMoveToUnassigned,
  onPromoteRequirement,
  onDemoteRequirement,
  onCreateSectionFromRequirement,
  onDeleteRequirement,
  onCutRequirement,
  onPasteBelowRequirement,
  onPasteAsChildRequirement,
  hasRequirementClipboard = false,
  sectionSolutionPanel,
  auxiliaryTabLabel = "",
  auxiliaryTabPanel = null,
}) {
  const inspectorTabs = useMemo(
    () => (auxiliaryTabLabel ? [...INSPECTOR_TABS, auxiliaryTabLabel] : INSPECTOR_TABS),
    [auxiliaryTabLabel],
  );
  const [activeTab, setActiveTab] = useState(INSPECTOR_TABS[0]);
  const [searchTerm, setSearchTerm] = useState("");
  const [relatedSearchState, setRelatedSearchState] = useState({
    loading: false,
    error: "",
    message: "",
  });
  const [relatedSearchResults, setRelatedSearchResults] = useState([]);
  const [aiMessages, setAiMessages] = useState([]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [dismissedRequirementId, setDismissedRequirementId] = useState("");
  const [docUploadState, setDocUploadState] = useState({
    loading: false,
    error: "",
    message: "",
  });
  const theme = useTheme();
  const isLightMode = theme.palette.mode === "light";
  const railSurface = isLightMode ? "#62717e" : GITHUB_BASE;
  const panelSurface = isLightMode ? "#3b4955" : "transparent";
  const panelSurfaceSoft = isLightMode ? "#3b4955" : "transparent";
  const panelSurfaceHover = isLightMode ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.04)";
  const panelBorder = isLightMode ? "rgba(255,255,255,0.14)" : "transparent";
  const inspectorText = isLightMode ? "#f5f7fa" : INSPECTOR_TEXT;
  const inspectorMutedText = isLightMode ? "rgba(245, 247, 250, 0.72)" : GITHUB_TEXT_MUTED;
  const inspectorAction = isLightMode ? "#64d3e3" : AI_ACTION;
  const aiHelperText = "#ffffff";
  const activeTabAccent = INSPECTOR_TAB_ACCENTS[activeTab] || "#f78166";
  const inspectorHeaderBg = isLightMode ? "#101821" : "transparent";
  const inspectorChromeBg = "rgba(9, 14, 20, 0.56)";
  const primaryButtonSx = {
    bgcolor: "#64d3e3",
    color: isLightMode ? "#ffffff" : "#140d18",
    boxShadow: isLightMode ? "0 10px 18px rgba(100, 211, 227, 0.22)" : "0 0 0 1px rgba(198, 120, 221, 0.18)",
    "&:hover": {
      bgcolor: "#45bfd2",
    },
  };
  const secondaryButtonSx = {
    color: aiHelperText,
    borderColor: "rgba(255,255,255,0.34)",
    bgcolor: "rgba(255,255,255,0.06)",
    "&:hover": {
      borderColor: "rgba(255,255,255,0.5)",
      bgcolor: "rgba(255,255,255,0.12)",
    },
    "&.Mui-disabled": {
      color: "rgba(255,255,255,0.38)",
      borderColor: "rgba(255,255,255,0.14)",
      bgcolor: "rgba(255,255,255,0.03)",
    },
  };
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || "");
  const aiMessagesEndRef = useRef(null);
  const docUploadInputRef = useRef(null);
  const aiAbortControllerRef = useRef(null);
  const requirementHasTable = hasTableBlock(requirement?.text || requirement?.summary || "");

  useEffect(() => {
    if (activeTab === auxiliaryTabLabel && !auxiliaryTabLabel) {
      setActiveTab(INSPECTOR_TABS[0]);
    }
  }, [activeTab, auxiliaryTabLabel]);

  useEffect(() => {
    setSelectedProjectId(projectId || "");
  }, [projectId]);

  useEffect(() => {
    aiMessagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [aiMessages, aiLoading]);

  useEffect(() => {
    if (searchTerm.trim()) {
      setRelatedSearchResults([]);
      setRelatedSearchState((current) => ({
        ...current,
        error: "",
        message: "",
      }));
    }
  }, [searchTerm]);

  useEffect(() => {
    setRelatedSearchResults([]);
    setRelatedSearchState({
      loading: false,
      error: "",
      message: "",
    });
  }, [requirement?.id]);

  const searchResults = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return [];
    }

    return allRequirements
      .filter((candidate) => {
        const haystack = [
          candidate.title,
          candidate.text,
          candidate.summary,
          candidate.sourceRef,
          candidate.intent,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 12);
  }, [allRequirements, searchTerm]);
  const visibleSearchResults = relatedSearchResults.length ? relatedSearchResults : searchResults;
  const aiRequirement = useMemo(() => {
    if (!requirement || requirement.id === dismissedRequirementId) {
      return null;
    }

    return requirement;
  }, [dismissedRequirementId, requirement]);

  const aiCheckedRequirements = useMemo(() => {
    if (aiRequirement) {
      return [
        {
          id: aiRequirement.sourceRef || aiRequirement.title || aiRequirement.id,
          section: section?.label || "",
          text: aiRequirement.text || aiRequirement.summary || aiRequirement.title || "",
        },
      ].filter((candidate) => candidate.id && candidate.text);
    }

    return Array.isArray(sectionRequirements)
      ? sectionRequirements
          .map((candidate) => candidate?.requirement || candidate)
          .map((candidate) => ({
            id: candidate?.sourceRef || candidate?.title || candidate?.id || "",
            section: section?.label || "",
            text: candidate?.text || candidate?.summary || candidate?.title || "",
          }))
          .filter((candidate) => candidate.id && candidate.text)
      : [];
  }, [aiRequirement, section, sectionRequirements]);

  async function handleSendAiPrompt() {
    const trimmedPrompt = aiPrompt.trim();
    if (!trimmedPrompt || aiLoading) {
      return;
    }

    const nextUserMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmedPrompt,
    };
    const nextAssistantMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "",
    };
    const requestMessages = [...aiMessages, nextUserMessage];

    setAiPrompt("");
    setAiError("");
    setAiLoading(true);
    setAiMessages((current) => [...current, nextUserMessage, nextAssistantMessage]);
    const abortController = new AbortController();
    aiAbortControllerRef.current = abortController;

    try {
      const response = await fetch("/api/storm/ai-helper", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: abortController.signal,
        body: JSON.stringify({
          prompt: trimmedPrompt,
          projectId: selectedProjectId,
          messages: requestMessages,
          checkedRequirements: aiCheckedRequirements,
          selectedRequirement: aiRequirement
            ? {
                id: aiRequirement.sourceRef || aiRequirement.title || aiRequirement.id,
                section: section?.label || "",
                text: aiRequirement.text || aiRequirement.summary || aiRequirement.title || "",
              }
            : null,
        }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "AI Helper request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      const updateAssistantMessage = (nextContent) => {
        setAiMessages((current) =>
          current.map((message) =>
            message.id === nextAssistantMessage.id
              ? { ...message, content: nextContent }
              : message,
          ),
        );
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
          assistantText += String(parsed?.delta || "");
          updateAssistantMessage(assistantText);
          return;
        }

        if (nextEventType === "error") {
          throw new Error(String(parsed?.detail || "AI Helper request failed").trim());
        }
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

      if (!assistantText.trim()) {
        throw new Error("AI Helper returned no content");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      const detail = error instanceof Error ? error.message : "AI Helper request failed";
      setAiError(detail);
      setAiMessages((current) =>
        current.map((message) =>
          message.id === nextAssistantMessage.id
            ? { ...message, content: detail }
            : message,
        ),
      );
    } finally {
      if (aiAbortControllerRef.current === abortController) {
        aiAbortControllerRef.current = null;
      }
      setAiLoading(false);
    }
  }

  function handleStopAiPrompt() {
    aiAbortControllerRef.current?.abort();
    aiAbortControllerRef.current = null;
    setAiLoading(false);
  }

  function handleAiPromptKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void handleSendAiPrompt();
  }

  async function handleSearchRelatedRequirements() {
    if (!projectId) {
      setRelatedSearchState({
        loading: false,
        error: "This workspace is not attached to a project yet.",
        message: "",
      });
      return;
    }

    const sourceText = String(requirement?.text || requirement?.summary || "").trim();
    if (!sourceText) {
      setRelatedSearchState({
        loading: false,
        error: "Select a requirement with text before running AI Assist.",
        message: "",
      });
      return;
    }

      setRelatedSearchState({
        loading: true,
        error: "",
        message: "Using AI to find highly relevant related requirements...",
      });

    try {
      const response = await fetch("/api/storm/requirements/search-related", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          sourceText,
          queryText: sourceText,
          limit: 12,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.detail || "Related requirement search failed");
      }

      const results = Array.isArray(payload?.results) ? payload.results : [];
      setRelatedSearchResults(
        results.map((item) => ({
          id: String(item?.requirement_id || crypto.randomUUID()),
          title: item?.section_heading || item?.section_number || "Related Requirement",
          sourceRef: String(item?.section_number || item?.requirement_id || "").toUpperCase(),
          intent: item?.match_reason || "Related requirement",
          text: item?.requirement_text || "",
          summary: item?.match_reason || "",
        }))
      );
      setSearchTerm("");
      setRelatedSearchState({
        loading: false,
        error: "",
        message: `Found ${results.length} highly relevant requirement relation${
          results.length === 1 ? "" : "s"
        }.`,
      });
    } catch (error) {
      setRelatedSearchResults([]);
      setRelatedSearchState({
        loading: false,
        error: error instanceof Error ? error.message : "Related requirement search failed",
        message: "",
      });
    }
  }

  function handleOpenDocUploadPicker() {
    if (!selectedProjectId) {
      setDocUploadState({
        loading: false,
        error: "Select a project before uploading documents.",
        message: "",
      });
      return;
    }

    docUploadInputRef.current?.click();
  }

  async function handleDocUploadChange(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (!files.length) {
      return;
    }

    if (!selectedProjectId) {
      setDocUploadState({
        loading: false,
        error: "Select a project before uploading documents.",
        message: "",
      });
      return;
    }

    setDocUploadState({
      loading: true,
      error: "",
      message: `Uploading ${files.length} document${files.length === 1 ? "" : "s"}...`,
    });

    try {
      const formData = new FormData();
      formData.append("projectId", selectedProjectId);
      files.forEach((file) => {
        formData.append("files", file, file.name);
      });

      const response = await fetch("/api/storm/project-documents/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.detail || "Document upload failed");
      }

      setDocUploadState({
        loading: false,
        error: "",
        message:
          String(payload?.message || "").trim() ||
          `Uploaded ${files.length} document${files.length === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setDocUploadState({
        loading: false,
        error: error instanceof Error ? error.message : "Document upload failed",
        message: "",
      });
    }
  }

  return (
    <Stack spacing={0} sx={{ height: "100%", minHeight: 0 }}>
      <Box
        sx={{
          px: 3,
          py: 0,
          pt: 0,
          border: "none",
          bgcolor: inspectorHeaderBg,
          borderRadius: 0,
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value)}
          variant="scrollable"
          scrollButtons={false}
          allowScrollButtonsMobile
          sx={{
            minHeight: 44,
            borderBottom: 0,
            bgcolor: inspectorHeaderBg,
            "& .MuiTabs-flexContainer": {
              gap: 2.2,
            },
            "& .MuiTabs-scroller": {
              overflowX: "auto !important",
            },
            "& .MuiTab-root": {
              minHeight: 44,
              minWidth: "fit-content",
              px: 0.2,
              py: 0,
              border: "0 !important",
              borderRadius: 0,
              bgcolor: "transparent !important",
              boxShadow: "none",
              color: isLightMode ? "#f5f7fa" : inspectorMutedText,
              fontSize: "0.92rem",
              lineHeight: 1.05,
              textTransform: "none",
              "& .MuiSvgIcon-root": {
                fontSize: 16,
              },
            },
            "& .MuiTab-root.Mui-selected": {
              color: isLightMode ? "#ffffff" : inspectorText,
              fontWeight: 600,
              bgcolor: "transparent !important",
            },
            "& .MuiTab-root.Mui-focusVisible": {
              bgcolor: "transparent !important",
            },
            "& .MuiTab-root:hover": {
              color: isLightMode ? "#ffffff" : inspectorText,
              bgcolor: "transparent !important",
            },
            "& .MuiTabs-indicator": {
              display: "block",
              height: 8,
              bottom: -4,
              borderRadius: 999,
              backgroundColor: activeTabAccent,
            },
          }}
        >
          {inspectorTabs.map((label) => {
            const TabIcon = INSPECTOR_TAB_ICONS[label] || PlaylistAddRounded;
            return (
              <Tab
                key={label}
                value={label}
                label={
                  <Stack direction="row" spacing={0.55} alignItems="center">
                    <TabIcon />
                    <Box component="span">{label}</Box>
                  </Stack>
                }
              />
            );
          })}
        </Tabs>
      </Box>
      <Paper
        variant="outlined"
        sx={{
          p: activeTab === "STORM" ? 0 : 1.35,
          flex: 1,
          minHeight: 0,
          borderRadius: 1.25,
          bgcolor: "transparent",
          borderColor: "transparent",
          boxShadow: "none",
          color: inspectorText,
        }}
      >
        <Stack
          spacing={2}
          sx={{
            pt: activeTab === "STORM" ? 0 : 0.25,
            height: "100%",
            bgcolor: "transparent",
          }}
        >
          {activeTab === "Edit" ? (
            <Stack spacing={1.5}>
              {requirementHasTable ? (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 1,
                    borderRadius: 1,
                    bgcolor: panelSurface,
                    borderColor: panelBorder,
                    boxShadow: "none",
                  }}
                >
                  <Stack spacing={0.75}>
                    <Typography variant="caption" sx={{ color: inspectorMutedText, fontWeight: 700 }}>
                      Full Table
                    </Typography>
                    <RichTextContent content={requirement?.text || requirement?.summary || ""} dense />
                  </Stack>
                </Paper>
              ) : null}
              <Stack
                direction="row"
                spacing={1}
                flexWrap="wrap"
                useFlexGap
                justifyContent="flex-start"
              >
                <Button
                  size="small"
                  variant="text"
                  startIcon={<PlaylistAddRounded />}
                  onClick={onCreateTopLevelRequirement}
                  sx={{
                    justifyContent: "flex-start",
                    color: inspectorText,
                    textTransform: "none",
                    px: 0.7,
                    py: 0.35,
                    minHeight: 32,
                    borderRadius: 1,
                    "&:hover": {
                      bgcolor: "var(--studio-hover-soft)",
                    },
                  }}
                >
                  Add New
                </Button>
                <Button
                  size="small"
                  variant="text"
                  startIcon={<PlaylistAddRounded />}
                  onClick={onCreateChildRequirement}
                  disabled={!requirement}
                  sx={{
                    justifyContent: "flex-start",
                    color: inspectorText,
                    textTransform: "none",
                    px: 0.7,
                    py: 0.35,
                    minHeight: 32,
                    borderRadius: 1,
                    "&:hover": {
                      bgcolor: "var(--studio-hover-soft)",
                    },
                  }}
                >
                  Add Child
                </Button>
                <Button
                  size="small"
                  variant="text"
                  startIcon={<PlaylistAddRounded />}
                  onClick={onCreateSectionFromRequirement}
                  disabled={!requirement}
                  sx={{
                    justifyContent: "flex-start",
                    color: inspectorText,
                    textTransform: "none",
                    px: 0.7,
                    py: 0.35,
                    minHeight: 32,
                    borderRadius: 1,
                    "&:hover": {
                      bgcolor: "var(--studio-hover-soft)",
                    },
                  }}
                >
                  Create Section
                </Button>
                <Button
                  size="small"
                  variant="text"
                  startIcon={<PlaylistAddRounded />}
                  onClick={onPromoteRequirement}
                  disabled={!requirement}
                  sx={{
                    justifyContent: "flex-start",
                    color: inspectorText,
                    textTransform: "none",
                    px: 0.7,
                    py: 0.35,
                    minHeight: 32,
                    borderRadius: 1,
                    "&:hover": {
                      bgcolor: "var(--studio-hover-soft)",
                    },
                  }}
                >
                  Promote
                </Button>
                <Button
                  size="small"
                  variant="text"
                  startIcon={<PlaylistAddRounded />}
                  onClick={onDemoteRequirement}
                  disabled={!requirement}
                  sx={{
                    justifyContent: "flex-start",
                    color: inspectorText,
                    textTransform: "none",
                    px: 0.7,
                    py: 0.35,
                    minHeight: 32,
                    borderRadius: 1,
                    "&:hover": {
                      bgcolor: "var(--studio-hover-soft)",
                    },
                  }}
                >
                  Demote
                </Button>
                <Button
                  size="small"
                  variant="text"
                  startIcon={<DeleteOutlineRounded />}
                  onClick={onCutRequirement}
                  disabled={!requirement}
                  sx={{
                    justifyContent: "flex-start",
                    color: "#f2cc60",
                    textTransform: "none",
                    px: 0.7,
                    py: 0.35,
                    minHeight: 32,
                    borderRadius: 1,
                    "&:hover": {
                      bgcolor: "rgba(242, 204, 96, 0.12)",
                    },
                  }}
                >
                  Cut
                </Button>
                <Button
                  size="small"
                  variant="text"
                  startIcon={<PlaylistAddRounded />}
                  onClick={onPasteBelowRequirement}
                  disabled={!hasRequirementClipboard}
                  sx={{
                    justifyContent: "flex-start",
                    color: inspectorText,
                    textTransform: "none",
                    px: 0.7,
                    py: 0.35,
                    minHeight: 32,
                    borderRadius: 1,
                    "&:hover": {
                      bgcolor: "var(--studio-hover-soft)",
                    },
                  }}
                >
                  Paste Below
                </Button>
                <Button
                  size="small"
                  variant="text"
                  startIcon={<PlaylistAddRounded />}
                  onClick={onPasteAsChildRequirement}
                  disabled={!hasRequirementClipboard}
                  sx={{
                    justifyContent: "flex-start",
                    color: inspectorText,
                    textTransform: "none",
                    px: 0.7,
                    py: 0.35,
                    minHeight: 32,
                    borderRadius: 1,
                    "&:hover": {
                      bgcolor: "var(--studio-hover-soft)",
                    },
                  }}
                >
                  Paste As Child
                </Button>
                <Button
                  size="small"
                  variant="text"
                  startIcon={<DeleteOutlineRounded />}
                  onClick={onDeleteRequirement}
                  disabled={!requirement}
                  sx={{
                    justifyContent: "flex-start",
                    color: "#f85149",
                    textTransform: "none",
                    px: 0.7,
                    py: 0.35,
                    minHeight: 32,
                    borderRadius: 1,
                    "&:hover": {
                      bgcolor: "rgba(248, 81, 73, 0.12)",
                    },
                  }}
                >
                  Delete
                </Button>
              </Stack>
                <TextField
                  fullWidth
                  value={String(requirement?.sourceRef || "").toUpperCase()}
                  onChange={(event) =>
                    onRequirementChange("sourceRef", event.target.value.toUpperCase())
                  }
                  disabled={!requirement}
                placeholder="Requirement title"
                variant="outlined"
                InputProps={{
                  sx: {
                    fontSize: "0.86rem",
                    fontWeight: 600,
                    color: inspectorText,
                    bgcolor: panelSurface,
                    borderRadius: 1,
                    "& input": {
                      color: inspectorText,
                    },
                    "& input::placeholder": {
                      color: inspectorMutedText,
                      opacity: 1,
                    },
                    "& fieldset": {
                      borderColor: "transparent",
                      borderWidth: 0,
                    },
                    "&:hover": {
                      bgcolor: panelSurfaceSoft,
                    },
                    "&:hover fieldset": {
                      borderColor: "transparent",
                      borderWidth: 0,
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "transparent",
                      borderWidth: 0,
                    },
                  },
                }}
              />
                <TextField
                  fullWidth
                  multiline
                  minRows={8}
                  value={requirement?.text || ""}
                  onChange={(event) => onRequirementChange("text", event.target.value)}
                  disabled={!requirement}
                placeholder="Requirement text"
                variant="outlined"
                InputLabelProps={{
                  sx: {
                    fontSize: "0.875rem",
                  },
                }}
                InputProps={{
                  sx: {
                    fontSize: "0.875rem",
                    lineHeight: 1.4,
                    alignItems: "flex-start",
                    color: inspectorText,
                    bgcolor: panelSurface,
                    borderRadius: 1,
                    "& textarea": {
                      color: inspectorText,
                    },
                    "& textarea::placeholder": {
                      color: inspectorMutedText,
                      opacity: 1,
                    },
                    "& fieldset": {
                      borderColor: "transparent",
                      borderWidth: 0,
                    },
                    "&:hover": {
                      bgcolor: panelSurfaceSoft,
                    },
                    "&:hover fieldset": {
                      borderColor: "transparent",
                      borderWidth: 0,
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "transparent",
                      borderWidth: 0,
                    },
                  },
                }}
              />
            </Stack>
          ) : null}

          {activeTab === "Search" ? (
            <Stack spacing={1.5}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="stretch">
                <TextField
                  fullWidth
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search requirements"
                  InputProps={{
                    sx: {
                      bgcolor: panelSurface,
                      color: inspectorText,
                      "& input": {
                        color: inspectorText,
                      },
                      "& input::placeholder": {
                        color: inspectorMutedText,
                        opacity: 1,
                      },
                    },
                    startAdornment: (
                      <SearchRounded sx={{ color: inspectorMutedText, mr: 1 }} />
                    ),
                  }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AutoAwesomeRounded />}
                  onClick={handleSearchRelatedRequirements}
                  disabled={relatedSearchState.loading || !projectId}
                  sx={{ flexShrink: 0, whiteSpace: "nowrap", ...primaryButtonSx }}
                >
                  {relatedSearchState.loading ? "Thinking..." : "AI Assist"}
                </Button>
              </Stack>
              {relatedSearchState.error ? (
                <Typography variant="body2" color="error">
                  {relatedSearchState.error}
                </Typography>
              ) : null}
              {!relatedSearchState.error && relatedSearchState.message ? (
                <Typography variant="body2" sx={{ color: inspectorMutedText }}>
                  {relatedSearchState.message}
                </Typography>
              ) : null}
              {searchTerm.trim() ? (
                <Typography variant="body2" sx={{ color: inspectorMutedText }}>
                  {searchResults.length} result{searchResults.length === 1 ? "" : "s"}
                </Typography>
              ) : relatedSearchResults.length ? (
                <Typography variant="body2" sx={{ color: inspectorMutedText }}>
                  {relatedSearchResults.length} AI-assisted match
                  {relatedSearchResults.length === 1 ? "" : "es"}
                </Typography>
              ) : (
                <Typography variant="body2" sx={{ color: inspectorMutedText }}>
                  Search manually, or use AI Assist to surface only highly relevant relations to
                  the selected requirement.
                </Typography>
              )}
              <Stack spacing={1}>
                {visibleSearchResults.map((candidate) => (
                  <Paper
                    key={candidate.id}
                    variant="outlined"
                    onClick={() => onSelectRequirement(candidate.id)}
                    sx={{
                      p: 1.25,
                      borderRadius: 1,
                      cursor: "pointer",
                      bgcolor:
                        candidate.id === requirement?.id
                          ? "#31404d"
                          : panelSurface,
                      borderColor:
                        candidate.id === requirement?.id
                          ? "#2f81f7"
                          : panelBorder,
                      "&:hover": {
                        bgcolor:
                          candidate.id === requirement?.id
                            ? "#385062"
                            : panelSurfaceHover,
                      },
                    }}
                  >
                    <Stack spacing={0.5}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: inspectorText }}>
                        {candidate.title}
                      </Typography>
                      <Typography variant="caption" sx={{ color: inspectorMutedText }}>
                        {String(candidate.sourceRef || candidate.intent || "Working draft").toUpperCase()}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          color: inspectorText,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {candidate.text || candidate.summary}
                      </Typography>
                    </Stack>
                  </Paper>
                ))}
                {searchTerm.trim() && !searchResults.length ? (
                  <Typography variant="body2" sx={{ color: inspectorMutedText }}>
                    No requirements matched that search.
                  </Typography>
                ) : null}
                {!searchTerm.trim() && relatedSearchResults.length === 0 && relatedSearchState.message ? (
                  <Typography variant="body2" sx={{ color: inspectorMutedText }}>
                    No related requirements were found.
                  </Typography>
                ) : null}
              </Stack>
            </Stack>
          ) : null}

          {activeTab === "AI Helper" ? (
            <Stack
              spacing={1.5}
              sx={{
                flex: 1,
                minHeight: 0,
                height: "100%",
              }}
            >
              {aiRequirement ? (
                <Box
                  sx={{
                    px: 1,
                    py: 0.9,
                    bgcolor: panelSurface,
                    border: `1px solid ${panelBorder}`,
                    borderRadius: 1,
                    position: "relative",
                    color: aiHelperText,
                  }}
                >
                  <IconButton
                    size="small"
                    onClick={() => setDismissedRequirementId(aiRequirement.id)}
                    sx={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      width: 22,
                      height: 22,
                      color: inspectorMutedText,
                    }}
                  >
                    <CloseRounded sx={{ fontSize: 15 }} />
                  </IconButton>
                  <Typography
                    variant="body2"
                    sx={{
                      color: inspectorText,
                      color: aiHelperText,
                      fontWeight: 500,
                      lineHeight: 1.35,
                      pr: 3.2,
                    }}
                  >
                    <Box
                      component="span"
                      sx={{
                        color: "#58a6ff",
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                        mr: 0.55,
                      }}
                    >
                      {String(
                        aiRequirement.sourceRef || aiRequirement.title || aiRequirement.id,
                      ).toUpperCase()}
                    </Box>
                    <Box component="span" sx={{ color: aiHelperText, mr: 0.55 }}>
                      Selected Requirement
                    </Box>
                    <Box component="span">
                      {aiRequirement.text || aiRequirement.summary || "No requirement text"}
                    </Box>
                  </Typography>
                </Box>
              ) : requirement ? (
                <Typography variant="body2" sx={{ color: aiHelperText }}>
                  Select a requirement or ask about section.
                </Typography>
              ) : null}
              <Paper
                sx={{
                  px: 1.05,
                  py: 0.35,
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  bgcolor: panelSurface,
                  border: `1px solid ${panelBorder}`,
                  borderRadius: 1,
                  boxShadow: "none",
                  color: aiHelperText,
                }}
              >
                <Stack spacing={2}>
                  {aiMessages.map((message) => (
                    <Box
                      key={message.id}
                      sx={{
                        alignSelf: "stretch",
                        px: 0,
                        py: 0,
                        color: aiHelperText,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          display: "block",
                          mb: 0.6,
                          color: message.role === "user" ? "#58a6ff" : aiHelperText,
                          textTransform: "uppercase",
                          letterSpacing: 0.55,
                        }}
                      >
                        {message.role === "user" ? "You" : "AI Helper"}
                      </Typography>
                      <RichTextContent content={message.content} dense />
                    </Box>
                  ))}
                  {aiLoading ? (
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ color: aiHelperText }}>
                      <CircularProgress size={14} />
                      <Typography variant="caption">Thinking...</Typography>
                    </Stack>
                  ) : null}
                  <Box ref={aiMessagesEndRef} />
                </Stack>
              </Paper>
              <Stack spacing={1} sx={{ mt: "auto", pt: 0.5, pb: 0 }}>
                <input
                  ref={docUploadInputRef}
                  type="file"
                  multiple
                  onChange={handleDocUploadChange}
                  style={{ display: "none" }}
                />
                {docUploadState.error ? (
                  <Typography variant="body2" color="error">
                    {docUploadState.error}
                  </Typography>
                ) : null}
                {!docUploadState.error && docUploadState.message ? (
                  <Typography variant="body2" sx={{ color: aiHelperText }}>
                    {docUploadState.message}
                  </Typography>
                ) : null}
                <TextField
                  fullWidth
                  multiline
                  minRows={1}
                  maxRows={6}
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value)}
                  onKeyDown={handleAiPromptKeyDown}
                  placeholder="Message the AI Helper..."
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start" sx={{ alignSelf: "flex-end", mb: 0.15 }}>
                        <IconButton
                          size="small"
                          onClick={handleOpenDocUploadPicker}
                          disabled={docUploadState.loading}
                          sx={{
                            mr: 0.5,
                            color: aiHelperText,
                            borderRadius: 999,
                            border: "1px solid rgba(255,255,255,0.34)",
                            bgcolor: "rgba(255,255,255,0.06)",
                            "&:hover": {
                              bgcolor: "rgba(255,255,255,0.12)",
                              borderColor: "rgba(255,255,255,0.5)",
                            },
                          }}
                        >
                          {docUploadState.loading ? (
                            <CircularProgress size={14} color="inherit" />
                          ) : (
                            <AddRounded fontSize="small" />
                          )}
                        </IconButton>
                      </InputAdornment>
                    ),
                    sx: {
                      fontSize: "0.875rem",
                      lineHeight: 1.4,
                      alignItems: "center",
                      bgcolor: panelSurface,
                      color: aiHelperText,
                      "& textarea": {
                        color: aiHelperText,
                      },
                      "& textarea::placeholder": {
                        color: "rgba(255,255,255,0.76)",
                        opacity: 1,
                      },
                    },
                  }}
                />
                {aiError ? (
                  <Typography variant="body2" color="error">
                    {aiError}
                  </Typography>
                ) : null}
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<AutoAwesomeRounded />}
                    onClick={handleSendAiPrompt}
                    disabled={!aiPrompt.trim() || aiLoading}
                    sx={{
                      ...primaryButtonSx,
                    }}
                  >
                    Send
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<CloseRounded />}
                    onClick={handleStopAiPrompt}
                    disabled={!aiLoading}
                    sx={secondaryButtonSx}
                  >
                    Stop
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setAiMessages([]);
                      setAiError("");
                    }}
                    disabled={aiLoading || (!aiMessages.length && !aiError)}
                    sx={secondaryButtonSx}
                  >
                    Clear chat
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    component="a"
                    href={typeof window === "undefined" ? "http://127.0.0.1:3100" : `${window.location.protocol}//${window.location.hostname}:3100`}
                    target="_blank"
                    rel="noreferrer"
                    sx={secondaryButtonSx}
                  >
                    OpenWebUI
                  </Button>
                </Stack>
              </Stack>
            </Stack>
          ) : null}

          {auxiliaryTabLabel && activeTab === auxiliaryTabLabel ? auxiliaryTabPanel : null}

          {activeTab === "STORM" ? (
            <Box
              sx={{
                mx: "-14px",
                mb: "-14px",
                mt: "-16px",
                pt: "16px",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                flex: 1,
                minHeight: 0,
                bgcolor: "transparent",
                "&::before": {
                  content: '""',
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: "16px",
                  bgcolor: "transparent",
                  pointerEvents: "none",
                },
              }}
            >
              {sectionSolutionPanel}
            </Box>
          ) : null}
        </Stack>
      </Paper>
    </Stack>
  );
}
