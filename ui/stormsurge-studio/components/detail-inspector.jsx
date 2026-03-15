"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PlaylistAddRounded from "@mui/icons-material/PlaylistAddRounded";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import AddRounded from "@mui/icons-material/AddRounded";
import EditNoteRounded from "@mui/icons-material/EditNoteRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import AccountTreeRounded from "@mui/icons-material/AccountTreeRounded";
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
import { RichTextContent } from "@/components/rich-text-content";

const INSPECTOR_TABS = ["STORM", "Edit", "Search", "AI Helper", "Structure"];
const INSPECTOR_TAB_ACCENTS = {
  Edit: "#f78166",
  Search: "#58a6ff",
  "AI Helper": "#3fb950",
  Structure: "#d29922",
  STORM: "#64d3e3",
};
const INSPECTOR_TAB_ICONS = {
  STORM: AutoAwesomeRounded,
  Edit: EditNoteRounded,
  Search: SearchRounded,
  "AI Helper": AutoAwesomeRounded,
  Structure: AccountTreeRounded,
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
  sectionSolutionPanel,
}) {
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
  const [docUploadState, setDocUploadState] = useState({
    loading: false,
    error: "",
    message: "",
  });
  const theme = useTheme();
  const isLightMode = theme.palette.mode === "light";
  const railSurface = isLightMode ? "#374351" : GITHUB_BASE;
  const panelSurface = "transparent";
  const panelSurfaceSoft = "transparent";
  const panelSurfaceHover = "rgba(255,255,255,0.04)";
  const panelBorder = "transparent";
  const inspectorText = isLightMode ? "var(--studio-chrome-text)" : INSPECTOR_TEXT;
  const inspectorMutedText = isLightMode ? "var(--studio-chrome-text)" : GITHUB_TEXT_MUTED;
  const inspectorAction = isLightMode ? "#64d3e3" : AI_ACTION;
  const inspectorChromeBg = "rgba(9, 14, 20, 0.56)";
  const primaryButtonSx = {
    bgcolor: "#64d3e3",
    color: isLightMode ? "#ffffff" : "#140d18",
    boxShadow: isLightMode ? "0 10px 18px rgba(100, 211, 227, 0.22)" : "0 0 0 1px rgba(198, 120, 221, 0.18)",
    "&:hover": {
      bgcolor: "#45bfd2",
    },
  };
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || "");
  const aiMessagesEndRef = useRef(null);
  const docUploadInputRef = useRef(null);

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

  const aiCheckedRequirements = useMemo(() => {
    if (!requirement) {
      return [];
    }

    return [
      {
        id: requirement.sourceRef || requirement.title || requirement.id,
        section: section?.label || "",
        text: requirement.text || requirement.summary || requirement.title || "",
      },
    ].filter((candidate) => candidate.id && candidate.text);
  }, [requirement, section]);

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

    try {
      const response = await fetch("/api/storm/ai-helper", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          projectId: selectedProjectId,
          messages: requestMessages,
          checkedRequirements: aiCheckedRequirements,
          selectedRequirement: requirement
            ? {
                id: requirement.sourceRef || requirement.title || requirement.id,
                section: section?.label || "",
                text: requirement.text || requirement.summary || requirement.title || "",
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
      setAiLoading(false);
    }
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

  if (!requirement) {
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 2.5,
          borderRadius: 1,
          bgcolor: panelSurface,
          borderColor: panelBorder,
        }}
      >
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Inspector
            </Typography>
        <Typography variant="body2" sx={{ mt: 1, color: "var(--studio-chrome-text)" }}>
          Select a node in the hierarchy to inspect and edit it.
        </Typography>
      </Paper>
    );
  }

  return (
    <Stack spacing={0} sx={{ height: "100%", minHeight: 0 }}>
      <Box
        sx={{
          px: 1.35,
          py: 0,
          pt: 0,
          border: "none",
          bgcolor: "transparent",
          borderRadius: 0,
          borderBottom: "1px solid rgba(255,255,255,0.4)",
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value)}
          variant="scrollable"
          scrollButtons={false}
          allowScrollButtonsMobile
          sx={{
            minHeight: 40,
            "& .MuiTabs-flexContainer": {
              gap: 2.2,
            },
            "& .MuiTabs-scroller": {
              overflowX: "auto !important",
            },
            "& .MuiTab-root": {
              position: "relative",
              minHeight: 40,
              minWidth: "fit-content",
              px: 0.2,
              py: 0,
              mb: "-1px",
              border: "0 !important",
              borderRadius: 0,
              bgcolor: "transparent !important",
              boxShadow: "none",
              color: inspectorMutedText,
              fontSize: "0.92rem",
              lineHeight: 1.05,
              textTransform: "none",
              "& .MuiSvgIcon-root": {
                fontSize: 16,
              },
            },
            "& .MuiTab-root.Mui-selected": {
              color: inspectorText,
              fontWeight: 600,
              bgcolor: "transparent !important",
              boxShadow: "none",
            },
            "& .MuiTab-root.Mui-focusVisible": {
              bgcolor: "transparent !important",
            },
            "& .MuiTab-root::after": {
              content: '""',
              position: "absolute",
              left: 0,
              right: 0,
              bottom: -1,
              height: 3,
              borderRadius: 999,
              bgcolor: "transparent",
              opacity: 0.95,
            },
            "& .MuiTab-root:hover": {
              color: inspectorText,
              bgcolor: "transparent !important",
            },
            "& .MuiTabs-indicator": {
              display: "none",
            },
          }}
        >
          {INSPECTOR_TABS.map((label) => {
            const accent = INSPECTOR_TAB_ACCENTS[label] || "#f78166";
            const TabIcon = INSPECTOR_TAB_ICONS[label];
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
                sx={{
                  "&.Mui-selected::after": {
                    bgcolor: accent,
                  },
                  "&:hover::after": {
                    bgcolor: activeTab === label ? accent : accent,
                    opacity: activeTab === label ? 0.95 : 0.45,
                  },
                }}
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
                  startIcon={<DeleteOutlineRounded />}
                  onClick={onDeleteRequirement}
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
                value={String(requirement.sourceRef || "").toUpperCase()}
                onChange={(event) =>
                  onRequirementChange("sourceRef", event.target.value.toUpperCase())
                }
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
                value={requirement.text}
                onChange={(event) => onRequirementChange("text", event.target.value)}
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
                        candidate.id === requirement.id
                          ? "#e9f7fa"
                          : panelSurface,
                      borderColor:
                        candidate.id === requirement.id
                          ? "#2f81f7"
                          : panelBorder,
                      "&:hover": {
                        bgcolor:
                          candidate.id === requirement.id
                            ? "#def2f6"
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
              {requirement ? (
                <Box
                  sx={{
                    px: 1,
                    py: 0.9,
                    bgcolor: panelSurface,
                    border: `1px solid ${panelBorder}`,
                    borderRadius: 1,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      color: inspectorText,
                      fontWeight: 500,
                      lineHeight: 1.35,
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
                      {String(requirement.sourceRef || requirement.title || requirement.id).toUpperCase()}
                    </Box>
                    <Box component="span" sx={{ color: inspectorMutedText, mr: 0.55 }}>
                      Selected Requirement
                    </Box>
                    <Box component="span">
                      {requirement.text || requirement.summary || "No requirement text"}
                    </Box>
                  </Typography>
                </Box>
              ) : null}
              <Paper
                sx={{
                  px: 0.25,
                  py: 0.35,
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  bgcolor: panelSurface,
                  border: `1px solid ${panelBorder}`,
                  borderRadius: 1,
                  boxShadow: "none",
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
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          display: "block",
                          mb: 0.6,
                          color: message.role === "user" ? "#58a6ff" : inspectorMutedText,
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
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ color: inspectorMutedText }}>
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
                  <Typography variant="body2" sx={{ color: inspectorMutedText }}>
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
                            color: inspectorMutedText,
                            borderRadius: 999,
                            border: `1px solid ${panelBorder}`,
                            bgcolor: panelSurface,
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
                      color: inspectorText,
                      "& textarea": {
                        color: inspectorText,
                      },
                      "& textarea::placeholder": {
                        color: inspectorMutedText,
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
                    onClick={() => {
                      setAiMessages([]);
                      setAiError("");
                    }}
                    disabled={aiLoading || (!aiMessages.length && !aiError)}
                  >
                    Clear chat
                  </Button>
                </Stack>
              </Stack>
            </Stack>
          ) : null}

          {activeTab === "Structure" ? (
            <Stack spacing={1.5}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Hierarchy Controls
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button size="small" variant="outlined" onClick={onPromoteRequirement}>
                  Promote
                </Button>
                <Button size="small" variant="outlined" onClick={onDemoteRequirement}>
                  Demote
                </Button>
                <Button size="small" variant="outlined" onClick={() => onMoveRequirement("up")}>
                  Move up
                </Button>
                <Button size="small" variant="outlined" onClick={() => onMoveRequirement("down")}>
                  Move down
                </Button>
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={onExpandAllRequirements}
                  disabled={!hasCollapsibleRequirements}
                >
                  Expand all
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={onCollapseAllRequirements}
                  disabled={!hasCollapsibleRequirements}
                >
                  Collapse all
                </Button>
              </Stack>
              <Typography variant="body2" sx={{ color: inspectorMutedText }}>
                Use these controls to reorganize the selected requirement within the current
                hierarchy.
              </Typography>
            </Stack>
          ) : null}

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
                  bgcolor: inspectorChromeBg,
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
