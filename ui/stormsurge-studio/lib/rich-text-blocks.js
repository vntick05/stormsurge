function stripInlineMarkdown(text) {
  return String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function isProbablyHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ""));
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

function parseCompressedInlineTable(line) {
  const rowMatches = [...String(line || "").matchAll(/\|[^|\n]*(?:\|[^|\n]*)+\|/g)];
  if (rowMatches.length < 3) {
    return null;
  }

  const separatorIndex = rowMatches.findIndex((match) => isMarkdownTableSeparator(match[0]));
  if (separatorIndex < 1 || separatorIndex === rowMatches.length - 1) {
    return null;
  }

  const headerMatch = rowMatches[separatorIndex - 1];
  const header = parseTableRow(headerMatch[0]);
  const rows = rowMatches.slice(separatorIndex + 1).map((match) => parseTableRow(match[0]));
  if (!header.length || !rows.length) {
    return null;
  }

  const prefix = String(line || "").slice(0, headerMatch.index).trim();
  const lastRowMatch = rowMatches[rowMatches.length - 1];
  const suffix = String(line || "")
    .slice((lastRowMatch.index || 0) + lastRowMatch[0].length)
    .trim();

  return {
    prefix,
    suffix,
    header,
    rows,
  };
}

export function parseRichTextBlocks(text) {
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

    const compressedInlineTable = parseCompressedInlineTable(line);
    if (compressedInlineTable) {
      if (compressedInlineTable.prefix) {
        blocks.push({
          type: "paragraph",
          text: stripInlineMarkdown(compressedInlineTable.prefix),
        });
      }
      blocks.push({
        type: "table",
        header: compressedInlineTable.header,
        rows: compressedInlineTable.rows,
      });
      if (compressedInlineTable.suffix) {
        blocks.push({
          type: "paragraph",
          text: stripInlineMarkdown(compressedInlineTable.suffix),
        });
      }
      index += 1;
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

export function hasTableBlock(contentOrBlocks) {
  const blocks = Array.isArray(contentOrBlocks) ? contentOrBlocks : parseRichTextBlocks(contentOrBlocks);
  return blocks.some((block) => block.type === "table");
}
