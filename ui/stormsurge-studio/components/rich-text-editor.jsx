"use client";

import { useEffect, useRef } from "react";
import FormatBoldRounded from "@mui/icons-material/FormatBoldRounded";
import FormatItalicRounded from "@mui/icons-material/FormatItalicRounded";
import FormatListBulletedRounded from "@mui/icons-material/FormatListBulletedRounded";
import FormatListNumberedRounded from "@mui/icons-material/FormatListNumberedRounded";
import TableChartRounded from "@mui/icons-material/TableChartRounded";
import FormatUnderlinedRounded from "@mui/icons-material/FormatUnderlinedRounded";
import FormatClearRounded from "@mui/icons-material/FormatClearRounded";
import { Box, IconButton, Stack, Tooltip } from "@mui/material";

const subtleScrollbarSx = {
  scrollbarWidth: "thin",
  scrollbarColor: "var(--studio-scrollbar) transparent",
  "&::-webkit-scrollbar": {
    width: 6,
    height: 6,
  },
  "&::-webkit-scrollbar-track": {
    background: "transparent",
  },
  "&::-webkit-scrollbar-thumb": {
    backgroundColor: "var(--studio-scrollbar)",
    borderRadius: 999,
    border: "1px solid transparent",
    backgroundClip: "padding-box",
  },
  "&:hover::-webkit-scrollbar-thumb": {
    backgroundColor: "var(--studio-text-muted)",
  },
};

export function RichTextEditor({
  value,
  onChange,
  placeholder = "",
  minHeight = 180,
  toolbarColor = "#f5f7fa",
  textColor = "#f5f7fa",
  surfaceColor = "transparent",
}) {
  const editorRef = useRef(null);

  useEffect(() => {
    const element = editorRef.current;
    if (!element) {
      return;
    }

    const nextValue = String(value || "");
    if (element.innerHTML !== nextValue) {
      element.innerHTML = nextValue;
    }
  }, [value]);

  function emitChange() {
    const element = editorRef.current;
    if (!element) {
      return;
    }
    onChange(element.innerHTML);
  }

  function applyCommand(command) {
    const element = editorRef.current;
    if (!element) {
      return;
    }
    element.focus();
    document.execCommand(command, false);
    emitChange();
  }

  function insertTable() {
    const element = editorRef.current;
    if (!element) {
      return;
    }
    element.focus();
    document.execCommand(
      "insertHTML",
      false,
      [
        "<table>",
        "<thead><tr><th>Column 1</th><th>Column 2</th></tr></thead>",
        "<tbody>",
        "<tr><td>Value</td><td>Value</td></tr>",
        "<tr><td>Value</td><td>Value</td></tr>",
        "</tbody>",
        "</table>",
        "<p></p>",
      ].join(""),
    );
    emitChange();
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          px: 0.75,
          py: 0.45,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          bgcolor: "transparent",
          flexShrink: 0,
        }}
      >
        <Tooltip title="Bold">
          <IconButton size="small" onClick={() => applyCommand("bold")} sx={{ color: toolbarColor }}>
            <FormatBoldRounded sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Italic">
          <IconButton size="small" onClick={() => applyCommand("italic")} sx={{ color: toolbarColor }}>
            <FormatItalicRounded sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Underline">
          <IconButton
            size="small"
            onClick={() => applyCommand("underline")}
            sx={{ color: toolbarColor }}
          >
            <FormatUnderlinedRounded sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Bulleted List">
          <IconButton
            size="small"
            onClick={() => applyCommand("insertUnorderedList")}
            sx={{ color: toolbarColor }}
          >
            <FormatListBulletedRounded sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Numbered List">
          <IconButton
            size="small"
            onClick={() => applyCommand("insertOrderedList")}
            sx={{ color: toolbarColor }}
          >
            <FormatListNumberedRounded sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Insert Table">
          <IconButton size="small" onClick={insertTable} sx={{ color: toolbarColor }}>
            <TableChartRounded sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Clear Formatting">
          <IconButton
            size="small"
            onClick={() => applyCommand("removeFormat")}
            sx={{ color: toolbarColor }}
          >
            <FormatClearRounded sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Stack>
      <Box
        sx={{
          flex: 1,
          minHeight,
          minWidth: 0,
          overflowY: "auto",
          overflowX: "hidden",
          boxSizing: "border-box",
          pb: 0.75,
          ...subtleScrollbarSx,
        }}
      >
        <Box
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emitChange}
          data-placeholder={placeholder}
          sx={{
            minHeight: "100%",
            boxSizing: "border-box",
            px: 1.4,
            pt: 1.1,
            pb: 1.8,
            color: textColor,
            bgcolor: surfaceColor,
            fontSize: "0.875rem",
            lineHeight: 1.45,
            outline: "none",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            "& p": {
              my: 0,
              mb: 0.85,
            },
            "& ul": {
              my: 0,
              mb: 0.85,
              pl: 2.5,
            },
            "& ol": {
              my: 0,
              mb: 0.85,
              pl: 2.6,
            },
            "& li": {
              mb: 0.35,
            },
            "& h1, & h2, & h3, & h4, & h5, & h6": {
              my: 0,
              mb: 0.65,
              lineHeight: 1.25,
              fontWeight: 700,
            },
            "& h1": {
              fontSize: "1.2rem",
            },
            "& h2": {
              fontSize: "1.08rem",
            },
            "& h3": {
              fontSize: "0.98rem",
            },
            "& table": {
              width: "100%",
              borderCollapse: "collapse",
              my: 0.4,
              mb: 0.9,
            },
            "& th, & td": {
              border: "1px solid rgba(255,255,255,0.18)",
              px: 0.85,
              py: 0.6,
              textAlign: "left",
              verticalAlign: "top",
            },
            "& th": {
              fontWeight: 700,
              bgcolor: "rgba(255,255,255,0.06)",
            },
            "& code": {
              fontFamily:
                'ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              fontSize: "0.82em",
              px: 0.45,
              py: 0.15,
              borderRadius: 0.5,
              bgcolor: "rgba(255,255,255,0.08)",
            },
            "&:empty:before": {
              content: "attr(data-placeholder)",
              color: "rgba(255,255,255,0.52)",
            },
            "&::after": {
              content: '""',
              display: "block",
              height: "12px",
            },
          }}
        />
      </Box>
    </Box>
  );
}
