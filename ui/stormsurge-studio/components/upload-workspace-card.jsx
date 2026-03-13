"use client";

import { useRef } from "react";
import UploadFileRounded from "@mui/icons-material/UploadFileRounded";
import { Button, Paper } from "@mui/material";

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
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 1 }}>
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
    </Paper>
  );
}
