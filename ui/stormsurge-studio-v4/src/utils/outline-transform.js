function slugifySegment(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `node-${Date.now()}`;
}

export function stripClassificationMarkings(value) {
  return String(value || '')
    .replace(/\(\s*U\s*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripDocumentLineNumbers(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) =>
      line
        // Remove standalone margin line numbers.
        .replace(/^\s*\d{1,4}\s*$/g, '')
        // Remove line-number prefixes when OCR preserves a wide gap after the number.
        .replace(/^\s*\d{1,4}(?:\s{2,}|\t+)/, '')
        .trimEnd()
    )
    .filter((line, index, lines) => line || (index > 0 && index < lines.length - 1))
    .join('\n');
}

export function sanitizeImportedText(value) {
  return stripClassificationMarkings(stripDocumentLineNumbers(value));
}

export function stripEmbeddedLineNumberFragments(value) {
  return String(value || '')
    // Remove orphan line-number fragments that were flattened into prose.
    .replace(/(^|[\s([{"'“”‘’])\d{1,4}(?=\s+[A-Z][a-z])/g, '$1')
    // Remove isolated 4-digit OCR line numbers that survived flattening.
    .replace(/(^|\s)\d{4}(?=\s|$)/g, '$1')
    // Clean up repeated spaces left behind by the fragment removal.
    .replace(/\s+/g, ' ')
    .trim();
}

function makeSectionId(section) {
  return `section-${slugifySegment(section.section_number || section.section_title)}`;
}

function makeSyntheticSectionId(value) {
  return `section-${slugifySegment(value)}`;
}

function summarize(text) {
  return sanitizeImportedText(text).slice(0, 220);
}

function formatDisplayLabel(rawId, fallback) {
  const cleaned = String(rawId || '')
    .replace(/\.p(\d+)/g, '.P$1')
    .replace(/\.b(\d+)/g, '.B$1')
    .trim();
  return cleaned || fallback;
}

function summarizeTable(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rowCount = Math.max(lines.length - 2, 0);
  return `Table block${rowCount ? ` · ${rowCount} row${rowCount === 1 ? '' : 's'}` : ''}`;
}

function summarizeArtifactDecision(decision) {
  const confidence = Number(decision?.attachment_confidence || 0);
  const method = String(decision?.attachment_method || 'unplaced').replace(/_/g, ' ');
  const reason = sanitizeImportedText(decision?.debug_reason || '');
  const prefix = `Unplaced artifact · ${method} · ${confidence.toFixed(2)}`;
  return reason ? `${prefix} · ${reason}` : prefix;
}

function renderTableMarkdown(header, rows) {
  const safeHeader = Array.isArray(header) ? header.map((cell) => String(cell || '').trim()) : [];
  const safeRows = Array.isArray(rows)
    ? rows.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell || '').trim()) : []))
    : [];
  const width = Math.max(safeHeader.length, ...safeRows.map((row) => row.length), 0);
  if (!width) return '';
  const padRow = (row) => [...row, ...Array(Math.max(width - row.length, 0)).fill('')];
  const normalizedHeader = padRow(safeHeader.length ? safeHeader : Array(width).fill(''));
  const lines = [
    `| ${normalizedHeader.join(' | ')} |`,
    `| ${Array(width).fill('---').join(' | ')} |`
  ];
  safeRows.forEach((row) => {
    lines.push(`| ${padRow(row).join(' | ')} |`);
  });
  return lines.join('\n');
}

function appendStructuredContent(contentBlocks, sectionId, parentId, positionStart, bucket) {
  let position = positionStart;
  (Array.isArray(contentBlocks) ? contentBlocks : []).forEach((block, index) => {
    if (!block || typeof block !== 'object') return;
    if (block.type === 'table') {
      const text = renderTableMarkdown(block.header || [], block.rows || []);
      bucket.push({
        id: `${parentId}.t${index + 1}`,
        sectionId,
        parentId,
        position,
        sourceRef: `${parentId}.t${index + 1}`,
        kind: 'table_text',
        title: formatDisplayLabel(`${parentId}.t${index + 1}`, 'Table Text'),
        summary: summarizeTable(text),
        text
      });
      position += 1;
    }
  });
}

function convertUnplacedArtifact(decision, sectionId, position) {
  const contentId = decision.object_id || `unplaced-${position}`;
  if (decision.type === 'table') {
    const text = renderTableMarkdown([], decision.rows || []);
    return {
      id: contentId,
      sectionId,
      parentId: null,
      position,
      sourceRef: contentId,
      kind: 'table_text',
      title: formatDisplayLabel(contentId, 'Unplaced Table'),
      summary: summarizeArtifactDecision(decision),
      text
    };
  }
  return {
    id: contentId,
    sectionId,
    parentId: null,
    position,
    sourceRef: contentId,
    kind: 'image',
    title: formatDisplayLabel(contentId, 'Unplaced Image'),
    summary: summarizeArtifactDecision(decision),
    text: sanitizeImportedText(decision.caption || decision.nearby_text_before || decision.nearby_text_after || ''),
    caption: sanitizeImportedText(decision.caption || ''),
    sourceNodeRef: decision.source_ref || null
  };
}

function formatSectionLabel(sectionNumber, sectionTitle) {
  const number = String(sectionNumber || '').trim();
  const title = sanitizeImportedText(sectionTitle);

  if (!number) return title;
  if (!title) return number;
  if (/^\d+(?:\.\d+)*\b/.test(title)) return title;

  return `${number} ${title}`.trim();
}

function convertContentNode(node, sectionId, parentId, position, bucket) {
  if (node.type === 'paragraph' || node.type === 'table_text' || node.type === 'image') {
    const contentId = node.id || `${node.type}-${sectionId}-${position}`;
    const text = sanitizeImportedText(node.text_exact || '');
    const isTable = node.type === 'table_text';
    const isImage = node.type === 'image';

    bucket.push({
      id: contentId,
      sectionId,
      parentId,
      position,
      sourceRef: contentId,
      kind: node.type,
      title: formatDisplayLabel(contentId, node.type === 'paragraph' ? 'Paragraph' : isTable ? 'Table Text' : 'Image'),
      summary: isTable ? summarizeTable(text) : summarize(text),
      text,
      caption: isImage ? sanitizeImportedText(node.caption || '') : undefined,
      sourceNodeRef: isImage ? node.source_ref || null : undefined
    });

    (node.children || []).forEach((child, index) => {
      convertContentNode(child, sectionId, contentId, index + 1, bucket);
    });
    appendStructuredContent(node.structured_content, sectionId, contentId, (node.children || []).length + 1, bucket);
    return;
  }

  if (node.type === 'bullet') {
    const bulletId = node.id || `bullet-${sectionId}-${position}`;
    const text = sanitizeImportedText(node.text_exact || '');

    bucket.push({
      id: bulletId,
      sectionId,
      parentId,
      position,
      sourceRef: bulletId,
      kind: 'bullet',
      title: formatDisplayLabel(bulletId, 'Bullet'),
      summary: summarize(text),
      text,
      marker: node.marker || '-'
    });

    (node.children || []).forEach((child, index) => {
      convertContentNode(child, sectionId, bulletId, index + 1, bucket);
    });
    appendStructuredContent(node.structured_content, sectionId, bulletId, (node.children || []).length + 1, bucket);
  }
}

function collectSection(sectionNode, parentId, depth, position, sectionsBucket, requirementsBucket) {
  const sectionId = makeSectionId(sectionNode);

  sectionsBucket.push({
    id: sectionId,
    label: formatSectionLabel(sectionNode.section_number, sectionNode.section_title),
    shortLabel: sectionNode.section_number || `S${sectionsBucket.length + 1}`,
    sectionNumber: sectionNode.section_number || null,
    parentId,
    depth,
    position
  });

  let contentPosition = 1;
  let childSectionPosition = 1;

  (sectionNode.children || []).forEach((child) => {
    if (child.section_number) {
      collectSection(child, sectionId, depth + 1, childSectionPosition, sectionsBucket, requirementsBucket);
      childSectionPosition += 1;
      return;
    }

    convertContentNode(child, sectionId, null, contentPosition, requirementsBucket);
    contentPosition += 1;
  });
}

export function transformOutlineToWorkspace(payload) {
  const rootSections = payload.root_sections || [];
  const sections = [];
  const requirements = [];

  rootSections.forEach((sectionNode) => {
    collectSection(sectionNode, null, 0, sections.length + 1, sections, requirements);
  });

  const alignmentDebug = Array.isArray(payload.alignment_debug) ? payload.alignment_debug : [];
  const compatibilityUnplaced = Array.isArray(payload.unplaced_artifacts) ? payload.unplaced_artifacts : [];
  const unplacedArtifacts = alignmentDebug.length
    ? alignmentDebug.filter((decision) => !decision.attached_section_id)
    : compatibilityUnplaced;
  if (unplacedArtifacts.length) {
    const sectionId = makeSyntheticSectionId('unplaced-artifacts');
    sections.push({
      id: sectionId,
      label: 'Unplaced Artifacts',
      shortLabel: 'UNPLACED',
      sectionNumber: null,
      parentId: null,
      depth: 0,
      position: sections.length + 1,
      isSynthetic: true
    });
    unplacedArtifacts.forEach((decision, index) => {
      requirements.push(convertUnplacedArtifact(decision, sectionId, index + 1));
    });
  }

  return {
    sections,
    requirements,
    sourceFilename: payload.filename || null,
    sourceFormat: payload.format || null,
    projectId: payload.project_id || null,
    importDebug: alignmentDebug
  };
}
