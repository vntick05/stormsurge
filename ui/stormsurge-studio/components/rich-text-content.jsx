"use client";

import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";

const GITHUB_BORDER = "var(--studio-border)";
const GITHUB_PANEL = "var(--studio-panel)";
const GITHUB_TEXT_MUTED = "var(--studio-text-muted)";

function stripInlineMarkdown(text) {
  return String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isProbablyHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ""));
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

function isMarkdownTableSeparator(line) {
  const trimmed = line.trim();
  return /^\|?[\s:-]+(?:\|[\s:-]+)+\|?$/.test(trimmed);
}

function isMarkdownTableRow(line) {
  const trimmed = line.trim();
  return trimmed.includes("|") && /^\|?.+\|.+\|?$/.test(trimmed);
}

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseMarkdownHeading(line) {
  const match = String(line || "").match(/^\s*(#{1,6})\s+(.+?)\s*$/);
  if (!match) {
    return null;
  }

  return {
    level: match[1].length,
    text: stripInlineMarkdown(match[2]),
  };
}

function parseBlocks(text) {
  if (isProbablyHtml(text)) {
    return [{ type: "html", html: String(text || "") }];
  }

  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (
      index + 1 < lines.length &&
      isMarkdownTableRow(line) &&
      isMarkdownTableSeparator(lines[index + 1])
    ) {
      const header = parseTableRow(line);
      const rows = [];
      index += 2;
      while (index < lines.length && isMarkdownTableRow(lines[index])) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    if (/^\s*(?:[-*]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (
        index < lines.length &&
        /^\s*(?:[-*]|\d+[.)])\s+/.test(lines[index]) &&
        /^\s*\d+[.)]\s+/.test(lines[index]) === ordered
      ) {
        items.push(
          stripInlineMarkdown(lines[index].replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").trim()),
        );
        index += 1;
      }
      blocks.push({ type: "list", items, ordered });
      continue;
    }

    const heading = parseMarkdownHeading(line);
    if (heading) {
      blocks.push({ type: "heading", ...heading });
      index += 1;
      continue;
    }

    const paragraphLines = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !(
        index + 1 < lines.length &&
        isMarkdownTableRow(lines[index]) &&
        isMarkdownTableSeparator(lines[index + 1])
      ) &&
      !/^\s*(?:[-*]|\d+[.)])\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: stripInlineMarkdown(paragraphLines.join("\n")) });
  }

  return blocks;
}

export function RichTextContent({ content, dense = false }) {
  const blocks = parseBlocks(content);

  if (!blocks.length) {
    return null;
  }

  return (
    <Box sx={{ display: "grid", gap: dense ? 0.85 : 1.2 }}>
      {blocks.map((block, blockIndex) => {
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
          return (
            <TableContainer
              key={`table-${blockIndex}`}
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
                  {block.rows.map((row, rowIndex) => (
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
