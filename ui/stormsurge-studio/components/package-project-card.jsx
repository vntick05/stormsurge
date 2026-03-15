"use client";

import { useRef, useState } from "react";
import FolderZipRounded from "@mui/icons-material/FolderZipRounded";
import { Button, Paper, Stack, TextField, Typography } from "@mui/material";

export function PackageProjectCard({ loading, onCreateProject }) {
  const inputRef = useRef(null);
  const [projectName, setProjectName] = useState("");
  const [files, setFiles] = useState([]);

  async function handleCreate() {
    const trimmedName = projectName.trim();
    if (!trimmedName || !files.length || loading) {
      return;
    }

    const created = await onCreateProject({
      projectName: trimmedName,
      files,
    });

    if (created) {
      setProjectName("");
      setFiles([]);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 3,
        height: "100%",
        borderRadius: 1,
        bgcolor: "var(--studio-panel)",
        borderColor: "var(--studio-border)",
        boxShadow: "var(--studio-card-shadow)",
        borderBottom: "3px solid var(--studio-accent-coral)",
      }}
    >
      <Stack spacing={2} sx={{ height: "100%" }}>
        <Stack spacing={0.75}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            New Package Project
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Upload the full package here first. StormStudio will extract, normalize, and index the
            files so search and AI tools can use the complete project later.
          </Typography>
        </Stack>
        <TextField
          fullWidth
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          placeholder="Project name"
          InputProps={{
            sx: {
              bgcolor: "var(--studio-surface)",
            },
          }}
        />
        <input
          hidden
          multiple
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md,.xlsx,.xls,.csv,.ppt,.pptx"
          onChange={(event) => {
            const nextFiles = Array.from(event.target.files || []);
            setFiles(nextFiles);
          }}
        />
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button
            variant="outlined"
            startIcon={<FolderZipRounded />}
            onClick={() => inputRef.current?.click()}
            disabled={loading}
          >
            Select files
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={loading || !projectName.trim() || !files.length}
          >
            {loading ? "Running pipeline..." : "Create project"}
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: "auto" }}>
          {files.length
            ? `${files.length} file${files.length === 1 ? "" : "s"} selected`
            : "Add the PWS plus any SOW, attachments, sections L/M, appendices, tables, or supporting files you want indexed into the package."}
        </Typography>
      </Stack>
    </Paper>
  );
}
