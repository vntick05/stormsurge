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

const INSPECTOR_TABS = ["Edit", "Search", "Structure"];

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
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
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
      <Paper
        variant="outlined"
        sx={{
          p: 2.5,
          borderRadius: 1.5,
          bgcolor: "#1A2028",
          borderColor: "rgba(47, 64, 90, 0.86)",
        }}
      >
        <Stack spacing={2}>
          <Tabs
            value={activeTab}
            onChange={(_, value) => setActiveTab(value)}
            variant="fullWidth"
            sx={{
              minHeight: 42,
              "& .MuiTab-root": {
                minHeight: 42,
              },
            }}
          >
            {INSPECTOR_TABS.map((label) => (
              <Tab key={label} value={label} label={label} />
            ))}
          </Tabs>

          {activeTab === "Edit" ? (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<PlaylistAddRounded />}
                  onClick={onCreateTopLevelRequirement}
                >
                  Add top-level
                </Button>
                <Button size="small" variant="contained" onClick={onCreateChildRequirement}>
                  Add child
                </Button>
                <Button size="small" variant="outlined" onClick={onCreateSectionFromRequirement}>
                  New tab from req
                </Button>
              </Stack>
              <TextField
                label="Requirement title"
                fullWidth
                value={requirement.title}
                onChange={(event) => onRequirementChange("title", event.target.value)}
              />
              <TextField
                label="Working text"
                fullWidth
                multiline
                minRows={8}
                value={requirement.text}
                onChange={(event) => onRequirementChange("text", event.target.value)}
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
                  },
                }}
              />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Section Controls
              </Typography>
              <Typography variant="body2" color="text.secondary">
                The active tab is <strong>{section?.label || "None"}</strong>. Send the selected
                node into that tab or move it back to the holding area.
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button
                  size="small"
                  variant="contained"
                  color="secondary"
                  onClick={onAssignToSection}
                >
                  Move to active tab
                </Button>
                <Button size="small" variant="outlined" onClick={onMoveToUnassigned}>
                  Send to holding area
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
                      borderRadius: 1.25,
                      cursor: "pointer",
                      bgcolor: candidate.id === requirement.id ? "#243552" : "#15191F",
                      borderColor:
                        candidate.id === requirement.id
                          ? "rgba(110, 168, 254, 0.55)"
                          : "rgba(47, 64, 90, 0.72)",
                      "&:hover": {
                        bgcolor: candidate.id === requirement.id ? "#243552" : "#1A2028",
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

      <Paper
        variant="outlined"
        sx={{
          p: 2.5,
          borderRadius: 1.5,
          bgcolor: "#1A2028",
          borderColor: "rgba(47, 64, 90, 0.86)",
        }}
      >
        <Stack spacing={1.5}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Provenance
          </Typography>
          <TextField
            label="Source reference"
            fullWidth
            value={requirement.sourceRef || ""}
            onChange={(event) => onRequirementChange("sourceRef", event.target.value)}
          />
          <TextField
            select
            label="Intent"
            fullWidth
            value={requirement.intent}
            onChange={(event) => onRequirementChange("intent", event.target.value)}
          >
            {[
              "Extracted paragraph",
              "Extracted section",
              "Extracted bullet",
              "Service continuity",
              "Engineering delivery",
              "Draft",
              "Sub-requirement",
            ].map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Paper>
    </Stack>
  );
}
