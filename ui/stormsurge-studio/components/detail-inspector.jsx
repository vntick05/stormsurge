"use client";

import { useMemo, useState } from "react";
import PlaylistAddRounded from "@mui/icons-material/PlaylistAddRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import {
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";

const INSPECTOR_TABS = ["Edit", "Search", "AI Helper", "Structure"];
const GITHUB_BASE = "#010409";
const GITHUB_SURFACE = "#0d1117";
const GITHUB_PANEL = "#161b22";
const GITHUB_PANEL_HOVER = "#1c2128";
const GITHUB_BORDER = "#30363d";
const GITHUB_TEXT_MUTED = "#7d8590";

export function DetailInspector({
  section,
  requirement,
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
}) {
  const [activeTab, setActiveTab] = useState(INSPECTOR_TABS[0]);
  const [searchTerm, setSearchTerm] = useState("");

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
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value)}
          variant="fullWidth"
          sx={{
            minHeight: 32,
            "& .MuiTabs-flexContainer": {
              gap: 0.55,
            },
            "& .MuiTab-root": {
              minHeight: 32,
              minWidth: 0,
              px: 0.95,
              py: 0.2,
              border: `1px solid ${GITHUB_BORDER}`,
              bgcolor: GITHUB_SURFACE,
              color: GITHUB_TEXT_MUTED,
              borderRadius: 1.1,
              fontSize: "0.82rem",
              lineHeight: 1,
            },
            "& .MuiTab-root.Mui-selected": {
              color: "#e6edf3",
              bgcolor: GITHUB_PANEL,
              borderColor: GITHUB_BORDER,
            },
            "& .MuiTabs-indicator": {
              display: "none",
            },
          }}
        >
          {INSPECTOR_TABS.map((label) => (
            <Tab key={label} value={label} label={label} />
          ))}
        </Tabs>
      </Box>
      <Paper
        variant="outlined"
        sx={{
          p: 0,
          borderRadius: 0,
          bgcolor: "transparent",
          borderColor: "transparent",
          boxShadow: "none",
        }}
      >
        <Stack spacing={2} sx={{ pt: 0.25 }}>
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
                <Button size="small" variant="outlined" onClick={onCreateSectionFromRequirement}>
                  New tab from req
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
            <Stack spacing={1.5}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                AI Helper
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Use this space for AI-assisted requirement drafting, rewrite prompts, and
                requirement-specific guidance.
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={6}
                placeholder="Ask the AI helper about the selected requirement..."
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
                <Button size="small" variant="outlined">
                  Draft Response
                </Button>
                <Button size="small" variant="outlined">
                  Rewrite Requirement
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
