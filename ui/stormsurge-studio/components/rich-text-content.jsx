"use client";

import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { parseRichTextBlocks, hasTableBlock } from "@/lib/rich-text-blocks";

const GITHUB_BORDER = "var(--studio-border)";
const GITHUB_PANEL = "var(--studio-panel)";
const GITHUB_TEXT_MUTED = "var(--studio-text-muted)";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function applyInlineMarkdownHtml(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
  html = html.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
  return html;
}

export function RichTextContent({
  content,
  blocks = null,
  dense = false,
  tablePreviewRows = null,
  showTableOverflowNote = false,
}) {
  const parsedBlocks = Array.isArray(blocks) ? blocks : parseRichTextBlocks(content);

  if (!parsedBlocks.length) {
    return null;
  }

  return (
    <Box sx={{ display: "grid", gap: dense ? 0.85 : 1.2 }}>
      {parsedBlocks.map((block, blockIndex) => {
        if (block.type === "html") {
          return (
            <Box
              key={`html-${blockIndex}`}
              sx={{
                color: "inherit",
                "& p": { my: 0, mb: dense ? 0.7 : 0.9 },
                "& ul, & ol": { my: 0, mb: dense ? 0.7 : 0.9, pl: 2.5 },
                "& li": { mb: 0.35 },
                "& table": { width: "100%", borderCollapse: "collapse", my: 0.5 },
                "& th, & td": {
                  border: `1px solid ${GITHUB_BORDER}`,
                  px: 1,
                  py: 0.7,
                  verticalAlign: "top",
                  textAlign: "left",
                },
                "& th": { bgcolor: GITHUB_PANEL, fontWeight: 700 },
                "& code": {
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                },
              }}
              dangerouslySetInnerHTML={{ __html: block.html }}
            />
          );
        }

        if (block.type === "table") {
          const previewRows =
            typeof tablePreviewRows === "number" && tablePreviewRows >= 0
              ? block.rows.slice(0, tablePreviewRows)
              : block.rows;
          const hasOverflowRows = previewRows.length < block.rows.length;

          return (
            <Box key={`table-${blockIndex}`} sx={{ display: "grid", gap: 0.6 }}>
              <TableContainer
                sx={{
                  border: `1px solid ${GITHUB_BORDER}`,
                  borderRadius: 1,
                  bgcolor: GITHUB_PANEL,
                  overflowX: "auto",
                }}
              >
                <Table size="small" sx={{ minWidth: 320, tableLayout: "fixed" }}>
                  <TableHead>
                    <TableRow>
                      {block.header.map((cell, cellIndex) => (
                        <TableCell
                          key={`head-${cellIndex}`}
                          sx={{
                            color: "inherit",
                            fontWeight: 700,
                            borderColor: GITHUB_BORDER,
                            whiteSpace: "normal",
                            wordBreak: "break-word",
                            verticalAlign: "top",
                          }}
                        >
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {previewRows.map((row, rowIndex) => (
                      <TableRow key={`row-${rowIndex}`}>
                        {row.map((cell, cellIndex) => (
                          <TableCell
                            key={`cell-${rowIndex}-${cellIndex}`}
                            sx={{
                              color: "inherit",
                              borderColor: GITHUB_BORDER,
                              verticalAlign: "top",
                              whiteSpace: "normal",
                              wordBreak: "break-word",
                            }}
                          >
                            {cell}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {showTableOverflowNote && hasOverflowRows ? (
                <Typography variant="caption" sx={{ color: GITHUB_TEXT_MUTED }}>
                  Showing {previewRows.length} of {block.rows.length} rows. Full table in inspector.
                </Typography>
              ) : null}
            </Box>
          );
        }

        if (block.type === "list") {
          if (dense) {
            return (
              <Box key={`list-${blockIndex}`} sx={{ display: "grid", gap: 0.55 }}>
                {block.items.map((item, itemIndex) => (
                  <Typography
                    key={`item-${itemIndex}`}
                    variant="body2"
                    sx={{ lineHeight: 1.5, color: "inherit" }}
                    dangerouslySetInnerHTML={{ __html: applyInlineMarkdownHtml(item) }}
                  >
                  </Typography>
                ))}
              </Box>
            );
          }

          return (
            <Box
              key={`list-${blockIndex}`}
              component={block.ordered ? "ol" : "ul"}
              sx={{ m: 0, pl: 2.5 }}
            >
              {block.items.map((item, itemIndex) => (
                <Box key={`item-${itemIndex}`} component="li" sx={{ mb: 0.35 }}>
                  <Typography
                    variant="body2"
                    sx={{ lineHeight: 1.5, color: "inherit" }}
                    dangerouslySetInnerHTML={{ __html: applyInlineMarkdownHtml(item) }}
                  />
                </Box>
              ))}
            </Box>
          );
        }

        if (block.type === "heading") {
          return (
            <Typography
              key={`heading-${blockIndex}`}
              variant={block.level <= 2 ? "subtitle1" : "body1"}
              sx={{
                fontWeight: 700,
                lineHeight: 1.3,
                color: "inherit",
                mt: dense ? 0.1 : 0.25,
              }}
              dangerouslySetInnerHTML={{ __html: applyInlineMarkdownHtml(block.text) }}
            >
            </Typography>
          );
        }

        return (
          <Typography
            key={`paragraph-${blockIndex}`}
            variant="body2"
            sx={{
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
              color: "inherit",
            }}
            dangerouslySetInnerHTML={{ __html: applyInlineMarkdownHtml(block.text) }}
          >
          </Typography>
        );
      })}
    </Box>
  );
}
