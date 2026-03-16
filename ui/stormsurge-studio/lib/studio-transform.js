function slugifySegment(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `node-${Date.now()}`;
}

function makeSectionId(section) {
  return `section-${slugifySegment(section.section_number || section.section_title)}`;
}

function summarize(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 160);
}

function formatDisplayLabel(rawId, fallback) {
  const cleaned = String(rawId || "")
    .replace(/\.p(\d+)/g, " p$1")
    .replace(/\.b(\d+)/g, " b$1")
    .trim();
  return cleaned || fallback;
}

function formatSectionLabel(sectionNumber, sectionTitle) {
  const number = String(sectionNumber || "").trim();
  const title = String(sectionTitle || "").trim();

  if (!number) {
    return title;
  }

  if (!title) {
    return number;
  }

  // Preserve extracted titles that already carry a fuller section marker such as "3.1 ...".
  if (/^\d+(?:\.\d+)*\b/.test(title)) {
    return title;
  }

  return `${number} ${title}`.trim();
}

function convertNode(node, sectionId, parentId, position, bucket) {
  if (node.type === "paragraph") {
    const paragraphId = node.id || `para-${sectionId}-${position}`;
    bucket.push({
      id: paragraphId,
      sectionId,
      parentId,
      position,
      sourceType: "extracted",
      accentColor: "#5f8dff",
      sourceRef: paragraphId,
      kind: "paragraph",
      title: formatDisplayLabel(paragraphId, "Paragraph"),
      summary: summarize(node.text_exact),
      text: node.text_exact || "",
      intent: "Extracted paragraph",
      marker: null,
    });

    (node.children || []).forEach((child, index) => {
      convertNode(child, sectionId, paragraphId, index + 1, bucket);
    });
    return;
  }

  if (node.type === "bullet") {
    const bulletId = node.id || `bullet-${sectionId}-${position}`;
    bucket.push({
      id: bulletId,
      sectionId,
      parentId,
      position,
      sourceType: "extracted",
      accentColor: "#5f8dff",
      sourceRef: bulletId,
      kind: "bullet",
      title: formatDisplayLabel(bulletId, "Bullet"),
      summary: summarize(node.text_exact),
      text: node.text_exact || "",
      intent: "Extracted bullet",
      marker: node.marker || "-",
    });
    return;
  }

  const sectionNodeId = `node-${slugifySegment(node.section_number || node.section_title)}-${position}`;
  bucket.push({
    id: sectionNodeId,
    sectionId,
    parentId,
    position,
    sourceType: "extracted",
    accentColor: "#5f8dff",
    sourceRef: node.section_number || node.section_title || sectionNodeId,
    kind: "section",
    title: formatDisplayLabel(node.section_number, "Section"),
    summary: node.section_title || "Extracted section",
    text: node.section_title || "",
    intent: "Extracted section",
    marker: null,
  });

  (node.children || []).forEach((child, index) => {
    convertNode(child, sectionId, sectionNodeId, index + 1, bucket);
  });
}

export function transformOutlineToWorkspace(payload) {
  const rootSections = payload.root_sections || [];
  const sections = rootSections.map((section, index) => ({
    id: makeSectionId(section),
    label: formatSectionLabel(section.section_number, section.section_title),
    shortLabel: section.section_number || `S${index + 1}`,
    prompt: "Drag the extracted hierarchy and reshape it into proposal-ready structure.",
    description:
      "This tab was generated from an extracted top-level PWS section and retains its internal hierarchy.",
    sourceKind: "extracted",
    sectionNumber: section.section_number || null,
  }));

  const requirements = [];
  rootSections.forEach((section, index) => {
    const sectionId = sections[index].id;
    (section.children || []).forEach((child, childIndex) => {
      convertNode(child, sectionId, null, childIndex + 1, requirements);
    });
  });

  return {
    sections,
    requirements,
    sourceFilename: payload.filename || null,
    sourceFormat: payload.format || null,
    projectId: payload.project_id || null,
  };
}
