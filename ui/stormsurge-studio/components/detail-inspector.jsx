"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PlaylistAddRounded from "@mui/icons-material/PlaylistAddRounded";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import {
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { RichTextContent } from "@/components/rich-text-content";

const INSPECTOR_TABS = ["Edit", "Search", "AI Helper", "Structure"];
const INSPECTOR_TAB_ACCENTS = {
  Edit: "#f78166",
  Search: "#58a6ff",
  "AI Helper": "#3fb950",
  Structure: "#d29922",
};
const GITHUB_BASE = "#010409";
const GITHUB_SURFACE = "#0d1117";
const GITHUB_PANEL = "#161b22";
const GITHUB_PANEL_HOVER = "#1c2128";
const GITHUB_BORDER = "#30363d";
const GITHUB_TEXT_MUTED = "#7d8590";

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
  onDeleteRequirement,
}) {
  const [activeTab, setActiveTab] = useState(INSPECTOR_TABS[0]);
  const [searchTerm, setSearchTerm] = useState("");
  const [aiMessages, setAiMessages] = useState([]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [availableProjects, setAvailableProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || "");
  const aiMessagesEndRef = useRef(null);

  useEffect(() => {
    setSelectedProjectId(projectId || "");
  }, [projectId]);

  useEffect(() => {
    let ignore = false;

    async function loadProjects() {
      try {
        const response = await fetch("/api/storm/active-projects", {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({ projects: [] }));
        if (!response.ok || ignore) {
          return;
        }
        setAvailableProjects(Array.isArray(payload?.projects) ? payload.projects : []);
      } catch {
        if (!ignore) {
          setAvailableProjects([]);
        }
      }
    }

    loadProjects();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    aiMessagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [aiMessages, aiLoading]);

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

  if (!requirement) {
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 2.5,
          borderRadius: 1,
          bgcolor: GITHUB_PANEL,
          borderColor: GITHUB_BORDER,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Inspector
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Select a node in the hierarchy to inspect and edit it.
        </Typography>
      </Paper>
    );
  }

  return (
    <Stack spacing={2}>
      <Box
        sx={{
          px: 0,
          py: 0,
          border: "none",
          bgcolor: "transparent",
          borderRadius: 0,
          borderBottom: `1px solid ${GITHUB_BORDER}`,
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
              px: 0.1,
              py: 0,
              mb: "-1px",
              border: "0 !important",
              borderRadius: 0,
              bgcolor: "transparent !important",
              boxShadow: "none",
              color: GITHUB_TEXT_MUTED,
              fontSize: "1rem",
              lineHeight: 1.05,
              textTransform: "none",
            },
            "& .MuiTab-root.Mui-selected": {
              color: "#e6edf3",
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
              bottom: 0,
              height: 2,
              borderRadius: 999,
              bgcolor: "transparent",
            },
            "& .MuiTab-root:hover": {
              color: "#e6edf3",
              bgcolor: "transparent !important",
            },
            "& .MuiTabs-indicator": {
              display: "none",
            },
          }}
        >
          {INSPECTOR_TABS.map((label) => {
            const accent = INSPECTOR_TAB_ACCENTS[label] || "#f78166";
            return (
              <Tab
                key={label}
                value={label}
                label={label}
                sx={{
                  "&.Mui-selected::after": {
                    bgcolor: accent,
                  },
                  "&:hover::after": {
                    bgcolor: activeTab === label ? accent : "rgba(255, 255, 255, 0.18)",
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
          p: 0,
          height: "100%",
          borderRadius: 0,
          bgcolor: "transparent",
          borderColor: "transparent",
          boxShadow: "none",
        }}
      >
        <Stack
          spacing={2}
          sx={{
            pt: 0.25,
            height: "100%",
          }}
        >
          {activeTab === "Edit" ? (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<PlaylistAddRounded />}
                  onClick={onCreateTopLevelRequirement}
                >
                  Add new req
                </Button>
                <Button size="small" variant="contained" onClick={onCreateChildRequirement}>
                  Add child
                </Button>
              </Stack>
              <TextField
                fullWidth
                value={requirement.sourceRef || ""}
                onChange={(event) => onRequirementChange("sourceRef", event.target.value)}
                placeholder="Requirement title"
                InputProps={{
                  sx: {
                    bgcolor: GITHUB_SURFACE,
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
                    bgcolor: GITHUB_SURFACE,
                  },
                }}
              />
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  onClick={onDeleteRequirement}
                >
                  Delete requirement
                </Button>
              </Stack>
            </Stack>
          ) : null}

          {activeTab === "Search" ? (
            <Stack spacing={1.5}>
              <TextField
                fullWidth
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search requirements"
                InputProps={{
                  sx: {
                    bgcolor: GITHUB_SURFACE,
                  },
                  startAdornment: <SearchRounded sx={{ color: "text.secondary", mr: 1 }} />,
                }}
              />
              {searchTerm.trim() ? (
                <Typography variant="body2" color="text.secondary">
                  {searchResults.length} result{searchResults.length === 1 ? "" : "s"}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Search by title, text, source reference, or intent.
                </Typography>
              )}
              <Stack spacing={1}>
                {searchResults.map((candidate) => (
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
                          ? "#1f2937"
                          : GITHUB_PANEL,
                      borderColor:
                        candidate.id === requirement.id
                          ? "#2f81f7"
                          : GITHUB_BORDER,
                      "&:hover": {
                        bgcolor:
                          candidate.id === requirement.id
                            ? "#243041"
                            : GITHUB_PANEL_HOVER,
                      },
                    }}
                  >
                    <Stack spacing={0.5}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {candidate.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {candidate.sourceRef || candidate.intent || "Working draft"}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
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
                  <Typography variant="body2" color="text.secondary">
                    No requirements matched that search.
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
              }}
            >
              {requirement ? (
                <Box sx={{ px: 0.1 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      mb: 0.45,
                      color: "#58a6ff",
                      textTransform: "uppercase",
                      letterSpacing: 0.55,
                    }}
                  >
                    Selected Requirement
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: "#e6edf3",
                      fontWeight: 600,
                      lineHeight: 1.35,
                    }}
                  >
                    {requirement.sourceRef || requirement.title || requirement.id}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      mt: 0.35,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {requirement.text || requirement.summary || "No requirement text"}
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
                  bgcolor: "transparent",
                  border: 0,
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
                          color: message.role === "user" ? "#58a6ff" : GITHUB_TEXT_MUTED,
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
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ color: GITHUB_TEXT_MUTED }}>
                      <CircularProgress size={14} />
                      <Typography variant="caption">Thinking...</Typography>
                    </Stack>
                  ) : null}
                  <Box ref={aiMessagesEndRef} />
                </Stack>
              </Paper>
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
                  sx: {
                    fontSize: "0.875rem",
                    lineHeight: 1.4,
                    alignItems: "flex-start",
                    bgcolor: GITHUB_SURFACE,
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
              <Typography variant="body2" color="text.secondary">
                Use these controls to reorganize the selected requirement within the current
                hierarchy.
              </Typography>
            </Stack>
          ) : null}
        </Stack>
      </Paper>
    </Stack>
  );
}
