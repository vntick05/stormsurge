"use client";

import { useRef } from "react";
import UploadFileRounded from "@mui/icons-material/UploadFileRounded";
import { Button, Paper, Stack, Typography } from "@mui/material";

export function UploadWorkspaceCard({ loading, onUpload }) {
  const inputRef = useRef(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await onUpload(file);
    event.target.value = "";
  }

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
      <Stack spacing={1.5}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          PWS Ingest
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Upload a PWS and rebuild its extracted hierarchy inside the new React
          workspace. This uses the structuring service, not seeded demo data.
        </Typography>
        <input
          hidden
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md"
          onChange={handleFileChange}
        />
        <Button
          variant="contained"
          size="large"
          startIcon={<UploadFileRounded />}
          onClick={() => inputRef.current?.click()}
          disabled={loading}
        >
          {loading ? "Building hierarchy..." : "Upload PWS"}
        </Button>
      </Stack>
    </Paper>
  );
}
