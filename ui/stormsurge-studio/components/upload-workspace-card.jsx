"use client";

import { useRef } from "react";
import UploadFileRounded from "@mui/icons-material/UploadFileRounded";
import { Button, Paper } from "@mui/material";

export function UploadWorkspaceCard({ loading, onUpload, compact = false }) {
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
        bgcolor: "rgba(95, 102, 115, 0.22)",
        borderColor: "rgba(208, 220, 243, 0.08)",
        boxShadow: "0 18px 28px rgba(8, 10, 12, 0.14)",
      }}
    >
      <input
        hidden
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.md"
        onChange={handleFileChange}
      />
      {button}
    </Paper>
  );
}
