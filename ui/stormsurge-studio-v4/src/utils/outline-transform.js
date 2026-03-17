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
    .replace(/\.s(\d+)/g, '.S$1')
    .trim();
  return cleaned || fallback;
}

function isSyntheticLabelText(text, sourceRef) {
  const normalizedText = sanitizeImportedText(text).replace(/\s+/g, '').toUpperCase();
  const normalizedSourceRef = String(sourceRef || '').replace(/\s+/g, '').toUpperCase();
  const normalizedDisplayLabel = formatDisplayLabel(sourceRef, '').replace(/\s+/g, '').toUpperCase();
  if (!normalizedText) {
    return true;
  }
  return Boolean(
    normalizedText &&
      ((normalizedSourceRef && normalizedText === normalizedSourceRef) ||
        (normalizedDisplayLabel && normalizedText === normalizedDisplayLabel))
  );
}

function splitParagraphSentences(text) {
  const normalized = sanitizeImportedText(text).replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const protectedText = normalized
    .replace(/(\d)\.(\d)/g, '$1__DOT__$2')
    .replace(/\b(U\.S\.|e\.g\.|i\.e\.|Mr\.|Mrs\.|Ms\.|Dr\.|vs\.)/g, (match) => match.replace(/\./g, '__DOT__'));

  const parts = protectedText
    .match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)
    ?.map((part) => part.replace(/__DOT__/g, '.').trim())
    .filter(Boolean);

  return parts && parts.length ? parts : [normalized];
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

function isLikelyContinuationParagraph(currentText, nextText) {
  const current = sanitizeImportedText(currentText).trim();
  const next = sanitizeImportedText(nextText).trim();
  if (!current || !next) return false;
  if (/[.!?:]$/.test(current)) return false;
  if (/^(?:However|Therefore|Additionally|Further|Furthermore|Moreover|Also|This|That|These|Those|And|Or|But)\b/i.test(next)) {
    return true;
  }
  return true;
}

function mergeContinuationNodes(nodes) {
  const merged = [];

  (Array.isArray(nodes) ? nodes : []).forEach((node) => {
    const current = node && typeof node === 'object' ? { ...node } : node;
    const previous = merged[merged.length - 1];

    if (
      previous &&
      current &&
      previous.type === 'paragraph' &&
      current.type === 'paragraph' &&
      isLikelyContinuationParagraph(previous.text_exact || '', current.text_exact || '')
    ) {
      previous.text_exact = `${sanitizeImportedText(previous.text_exact || '')} ${sanitizeImportedText(current.text_exact || '')}`.trim();
      previous.children = [...(previous.children || []), ...(current.children || [])];
      previous.structured_content = [...(previous.structured_content || []), ...(current.structured_content || [])];
      return;
    }

    merged.push(current);
  });

  return merged;
}

function convertContentNode(node, sectionId, parentId, position, bucket, options = {}) {
  const sourceRefOverride = options.sourceRefOverride || null;
  if (node.type === 'paragraph' || node.type === 'table_text' || node.type === 'image') {
    const contentId = node.id || `${node.type}-${sectionId}-${position}`;
    const text = sanitizeImportedText(node.text_exact || '');
    const isTable = node.type === 'table_text';
    const isImage = node.type === 'image';

    if (node.type === 'paragraph' && !text) {
      let childPosition = 1;
      (node.children || []).forEach((child) => {
        convertContentNode(child, sectionId, parentId, childPosition, bucket);
        childPosition += 1;
      });
      appendStructuredContent(node.structured_content, sectionId, parentId, childPosition, bucket);
      return;
    }

    if (node.type === 'paragraph' && text) {
      const sentences = splitParagraphSentences(text);
      const sentenceIds = [];
      sentences.forEach((sentence, index) => {
        const sentenceId = `${contentId}.s${index + 1}`;
        const sentenceSourceRef = sourceRefOverride && index === 0 ? sourceRefOverride : sentenceId;
        if (isSyntheticLabelText(sentence, sentenceSourceRef)) {
          return;
        }
        sentenceIds.push(sentenceId);
        bucket.push({
          id: sentenceId,
          sectionId,
          parentId,
          position: position + index,
          sourceRef: sentenceSourceRef,
          kind: 'paragraph',
          title: formatDisplayLabel(sentenceSourceRef, 'Sentence'),
          summary: summarize(sentence),
          text: sentence
        });
      });
      const terminalParentId = sentenceIds[sentenceIds.length - 1] || parentId;
      let childPosition = 1;
      (node.children || []).forEach((child) => {
        convertContentNode(child, sectionId, terminalParentId, childPosition, bucket);
        childPosition += 1;
      });
      appendStructuredContent(node.structured_content, sectionId, terminalParentId, childPosition, bucket);
      return;
    }

    bucket.push({
      id: contentId,
      sectionId,
      parentId,
      position,
      sourceRef: sourceRefOverride || contentId,
      kind: node.type,
      title: formatDisplayLabel(sourceRefOverride || contentId, node.type === 'paragraph' ? 'Paragraph' : isTable ? 'Table Text' : 'Image'),
      summary: isTable ? summarizeTable(text) : summarize(text),
      text,
      caption: isImage ? sanitizeImportedText(node.caption || '') : undefined,
      sourceNodeRef: isImage ? node.source_ref || null : undefined
    });

    let childPosition = 1;
    (node.children || []).forEach((child) => {
      convertContentNode(child, sectionId, contentId, childPosition, bucket);
      childPosition += 1;
    });
    appendStructuredContent(node.structured_content, sectionId, contentId, childPosition, bucket);
    return;
  }

  if (node.type === 'bullet') {
    const bulletId = node.id || `bullet-${sectionId}-${position}`;
    const text = sanitizeImportedText(node.text_exact || '');
    if (isSyntheticLabelText(text, bulletId)) {
      return;
    }

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
  const mergedChildren = mergeContinuationNodes(sectionNode.children || []);
  const childSectionCount = mergedChildren.filter((child) => child?.section_number).length;

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

  mergedChildren.forEach((child, index) => {
    if (child.section_number) {
      collectSection(child, sectionId, depth + 1, childSectionPosition, sectionsBucket, requirementsBucket);
      childSectionPosition += 1;
      return;
    }

    const shouldUseSectionNumberLabel =
      childSectionCount === 0 &&
      index === 0 &&
      child?.type === 'paragraph' &&
      String(child?.id || '').endsWith('.p1') &&
      Boolean(sectionNode.section_number);

    convertContentNode(child, sectionId, null, contentPosition, requirementsBucket, {
      sourceRefOverride: shouldUseSectionNumberLabel ? sectionNode.section_number : null
    });
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
    importDebug: alignmentDebug,
    hierarchyArtifact:
      payload.format === 'pws_hierarchy_v1'
        ? {
            sourceKind: payload.source_kind || null,
            cleanedMarkdown: payload.cleaned_markdown || '',
            stats: payload.stats || null,
            topSections: rootSections.map((section) => ({
              sectionNumber: section.section_number || null,
              sectionTitle: section.section_title || ''
            }))
          }
        : payload.hierarchy_artifact
          ? {
              sourceKind: payload.hierarchy_artifact.source_kind || null,
              cleanedMarkdown: payload.hierarchy_artifact.cleaned_markdown || '',
              stats: payload.hierarchy_artifact.stats || null,
              topSections: (payload.hierarchy_artifact.root_sections || []).map((section) => ({
                sectionNumber: section.section_number || null,
                sectionTitle: section.section_title || ''
              }))
            }
          : null
  };
}
