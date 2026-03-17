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

function makeSectionId(section) {
  return `section-${slugifySegment(section.section_number || section.section_title)}`;
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

function formatSectionLabel(sectionNumber, sectionTitle) {
  const number = String(sectionNumber || '').trim();
  const title = sanitizeImportedText(sectionTitle);

  if (!number) return title;
  if (!title) return number;
  if (/^\d+(?:\.\d+)*\b/.test(title)) return title;

  return `${number} ${title}`.trim();
}

function convertContentNode(node, sectionId, parentId, position, bucket) {
  if (node.type === 'paragraph' || node.type === 'table_text') {
    const contentId = node.id || `${node.type}-${sectionId}-${position}`;
    const text = sanitizeImportedText(node.text_exact || '');

    bucket.push({
      id: contentId,
      sectionId,
      parentId,
      position,
      sourceRef: contentId,
      kind: node.type,
      title: formatDisplayLabel(contentId, node.type === 'paragraph' ? 'Paragraph' : 'Table Text'),
      summary: summarize(text),
      text
    });

    (node.children || []).forEach((child, index) => {
      convertContentNode(child, sectionId, contentId, index + 1, bucket);
    });
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

  return {
    sections,
    requirements,
    sourceFilename: payload.filename || null,
    sourceFormat: payload.format || null,
    projectId: payload.project_id || null
  };
}
