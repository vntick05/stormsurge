"use client";

import { useRef } from "react";
import UploadFileRounded from "@mui/icons-material/UploadFileRounded";
import { Button, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";

export function UploadWorkspaceCard({
  loading,
  onUpload,
  compact = false,
  selectedProjectId = "",
  projects = [],
  onProjectChange,
}) {
  const inputRef = useRef(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await onUpload(file);
    event.target.value = "";
  }

  const button = (
    <Button
      variant="contained"
      size={compact ? "medium" : "large"}
      startIcon={<UploadFileRounded />}
      onClick={() => inputRef.current?.click()}
      disabled={loading}
    >
      {loading ? "Building hierarchy..." : "Upload PWS"}
    </Button>
  );

  if (compact) {
    return (
      <>
        <input
          hidden
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md"
          onChange={handleFileChange}
        />
        {button}
      </>
    );
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 3,
        borderRadius: 1,
        bgcolor: "var(--studio-panel)",
        borderColor: "var(--studio-border)",
        boxShadow: "var(--studio-card-shadow)",
        borderBottom: "3px solid var(--studio-ai-action)",
      }}
    >
      <Stack spacing={2}>
        <input
          hidden
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md"
          onChange={handleFileChange}
        />
        <Stack spacing={0.75}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Upload PWS
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Build the editable hierarchy from a PWS file and optionally attach it to an indexed
            project so search and AI tools can use the rest of the package.
          </Typography>
        </Stack>
        <TextField
          select
          fullWidth
          value={selectedProjectId}
          onChange={(event) => onProjectChange?.(event.target.value)}
          helperText={
            selectedProjectId
              ? "This workspace will use the selected project as its package data source."
              : "No project selected. The workspace will be file-only until you attach a project."
          }
          InputProps={{
            sx: {
              bgcolor: "var(--studio-surface)",
            },
          }}
        >
          <MenuItem value="">No project attached</MenuItem>
          {projects.map((project) => {
            const value = String(project?.project_id || "").trim();
            if (!value) {
              return null;
            }
            return (
              <MenuItem key={value} value={value}>
                {String(project?.display_name || value).trim()}
              </MenuItem>
            );
          })}
        </TextField>
        {button}
      </Stack>
    </Paper>
  );
}
