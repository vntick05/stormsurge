"use client";

import { useMemo, useRef, useState } from "react";
import CloudUploadRounded from "@mui/icons-material/CloudUploadRounded";
import ExpandLessRounded from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { getChildren, getSectionRoots } from "@/lib/studio-graph";

const GITHUB_SURFACE = "#0d1117";
const GITHUB_PANEL = "#161b22";
const GITHUB_PANEL_HOVER = "#1c2128";
const GITHUB_PANEL_SELECTED = "#1f2937";
const GITHUB_BORDER = "#30363d";
const GITHUB_TEXT_MUTED = "#7d8590";
const GITHUB_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

function formatRequirementMarker(requirement) {
  const source = String(requirement.sourceRef || requirement.title || "").trim();
  return (source || requirement.title || "Requirement").toUpperCase();
}

function ImportRequirementNode({
  requirement,
  allRequirements,
  checkedIds,
  collapsedIds,
  onToggleChecked,
  onToggleCollapsed,
  depth = 0,
}) {
  const children = getChildren(allRequirements, requirement.id);
  const collapsed = collapsedIds.has(requirement.id);
  const checked = checkedIds.has(requirement.id);

  return (
    <Box sx={{ ml: depth * 1.25, mb: 0.85 }}>
      <Box
        sx={{
          px: 1.1,
          py: 0.55,
          borderRadius: 1,
          bgcolor: checked ? GITHUB_PANEL_SELECTED : GITHUB_PANEL,
          transition: "background-color 120ms ease",
          "&:hover": {
            bgcolor: checked ? GITHUB_PANEL_SELECTED : GITHUB_PANEL_HOVER,
          },
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Checkbox
            checked={checked}
            onChange={() => onToggleChecked(requirement.id)}
            size="small"
            sx={{ p: 0.35 }}
          />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                fontFamily: GITHUB_FONT_STACK,
                fontSize: "0.875rem",
                lineHeight: 1.42,
                fontWeight: 400,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                color: "#e6edf3",
              }}
            >
              <Box component="span" sx={{ color: "#8FB7FF", fontWeight: 600, mr: 0.45 }}>
                {formatRequirementMarker(requirement)}
              </Box>
              <Box component="span">{requirement.text || requirement.summary}</Box>
            </Typography>
          </Box>
          {children.length ? (
            <Button
              size="small"
              onClick={() => onToggleCollapsed(requirement.id)}
              sx={{
                minWidth: 28,
                px: 0.3,
                color: "#e6edf3",
                borderRadius: 1,
              }}
            >
              {collapsed ? (
                <ExpandMoreRounded fontSize="small" />
              ) : (
                <ExpandLessRounded fontSize="small" />
              )}
            </Button>
          ) : null}
        </Stack>
      </Box>
      {children.length && !collapsed ? (
        <Box sx={{ mt: 0.85 }}>
          {children.map((child) => (
            <ImportRequirementNode
              key={child.id}
              requirement={child}
              allRequirements={allRequirements}
              checkedIds={checkedIds}
              collapsedIds={collapsedIds}
              onToggleChecked={onToggleChecked}
              onToggleCollapsed={onToggleCollapsed}
              depth={depth + 1}
            />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

export function RequirementImportDialog({
  open,
  targetRequirement,
  sourceWorkspace,
  activeSectionId,
  checkedIds,
  loading,
  error,
  onClose,
  onUpload,
  onSelectSection,
  onToggleChecked,
  onImport,
}) {
  const inputRef = useRef(null);
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());

  const sections = sourceWorkspace?.sections || [];
  const requirements = sourceWorkspace?.requirements || [];
  const selectedSectionId = activeSectionId || sections[0]?.id || "";
  const sectionRequirements = useMemo(
    () => (selectedSectionId ? getSectionRoots(requirements, selectedSectionId) : []),
    [requirements, selectedSectionId],
  );

  function toggleCollapsed(requirementId) {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(requirementId)) {
        next.delete(requirementId);
      } else {
        next.add(requirementId);
      }
      return next;
    });
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    onUpload(file);
    event.target.value = "";
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle>Import Reqs</DialogTitle>
      <DialogContent
        sx={{
          bgcolor: GITHUB_SURFACE,
          backgroundImage: "none",
        }}
      >
        <Stack spacing={2.25} sx={{ pt: 1 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ xs: "stretch", md: "center" }}>
            <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
              {targetRequirement
                ? `Selected imports will be added under: ${String(
                    targetRequirement.sourceRef || targetRequirement.title || targetRequirement.id
                  ).toUpperCase()}`
                : "No requirement is selected. Imported requirements will be added at the top of the active section."}
            </Typography>
            <input hidden ref={inputRef} type="file" accept=".pdf,.doc,.docx" onChange={handleFileChange} />
            <Button
              variant="outlined"
              startIcon={<CloudUploadRounded />}
              onClick={() => inputRef.current?.click()}
              disabled={loading}
            >
              {requirements.length ? "Open Another PWS" : "Open PWS"}
            </Button>
          </Stack>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", lg: "240px minmax(0, 1fr)" },
              gap: 2,
              minHeight: 520,
            }}
          >
            <Paper
              variant="outlined"
              sx={{
                p: 1.25,
                borderRadius: 1,
                bgcolor: GITHUB_PANEL,
                borderColor: GITHUB_BORDER,
              }}
            >
              <Stack spacing={0.9}>
                <Typography variant="subtitle2" sx={{ color: "#ffffff", fontWeight: 700 }}>
                  Imported Sections
                </Typography>
                {sections.length ? (
                  sections.map((section) => (
                    <Button
                      key={section.id}
                      onClick={() => onSelectSection(section.id)}
                      variant="text"
                      sx={{
                        justifyContent: "flex-start",
                        px: 1,
                        py: 0.8,
                        borderRadius: 1,
                        color: section.id === selectedSectionId ? "#e6edf3" : GITHUB_TEXT_MUTED,
                        bgcolor:
                          section.id === selectedSectionId
                            ? "rgba(255,255,255,0.08)"
                            : "transparent",
                        textTransform: "none",
                      }}
                    >
                      {section.label}
                    </Button>
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Upload another PWS to preview its extracted hierarchy.
                  </Typography>
                )}
              </Stack>
            </Paper>
            <Paper
              variant="outlined"
              sx={{
                p: 1.4,
                borderRadius: 1,
                bgcolor: GITHUB_SURFACE,
                borderColor: GITHUB_BORDER,
                overflowY: "auto",
              }}
            >
              {loading ? (
                <Stack spacing={1.2} alignItems="center" justifyContent="center" sx={{ minHeight: 360 }}>
                  <Typography variant="body1">Opening PWS hierarchy...</Typography>
                  <Typography variant="body2" color="text.secondary">
                    StormSurge is extracting the requirement tree for import.
                  </Typography>
                </Stack>
              ) : sectionRequirements.length ? (
                <Stack spacing={0.9}>
                  {sectionRequirements.map((requirement) => (
                    <ImportRequirementNode
                      key={requirement.id}
                      requirement={requirement}
                      allRequirements={requirements}
                      checkedIds={checkedIds}
                      collapsedIds={collapsedIds}
                      onToggleChecked={onToggleChecked}
                      onToggleCollapsed={toggleCollapsed}
                    />
                  ))}
                </Stack>
              ) : (
                <Stack spacing={1.2} alignItems="center" justifyContent="center" sx={{ minHeight: 360 }}>
                  <Typography variant="body1">No imported requirements yet</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Upload a PWS and the extracted requirement hierarchy will appear here.
                  </Typography>
                </Stack>
              )}
            </Paper>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, bgcolor: GITHUB_SURFACE }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={onImport}
          variant="contained"
          disabled={!checkedIds.size}
        >
          Add Selected Reqs
        </Button>
      </DialogActions>
    </Dialog>
  );
}
