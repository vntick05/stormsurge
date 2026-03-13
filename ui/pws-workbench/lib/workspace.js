export const emptyWorkspace = {
  primaryDocument: "No PWS loaded",
  stats: {
    sections: 0,
    blocks: 0,
    reviewableItems: 0,
    flaggedItems: 0,
    acceptedItems: 0,
  },
  tree: [],
  selectedId: null,
  details: {},
  reviewQueue: [],
};

function contentTypeLabel(type) {
  if (type === "paragraph") {
    return "Paragraph";
  }
  if (type === "bullet") {
    return "Bullet";
  }
  if (type === "table_text") {
    return "Table Text";
  }
  return "Content";
}

function buildSectionMeta(section) {
  const directParagraphs = (section.children || []).filter((child) => child.type === "paragraph").length;
  const directSubsections = (section.children || []).filter((child) => Boolean(child.section_number)).length;
  return `${directParagraphs} paragraph${directParagraphs === 1 ? "" : "s"} · ${directSubsections} subsection${directSubsections === 1 ? "" : "s"}`;
}

function sectionBlocks(children) {
  const blocks = [];
  for (const child of children || []) {
    if (child.type === "paragraph") {
      blocks.push({
        id: child.id,
        type: "paragraph",
        typeLabel: "Paragraph",
        text: child.text_exact || "",
      });
      for (const nested of child.children || []) {
        if (nested.type === "bullet" || nested.type === "table_text") {
          blocks.push({
            id: nested.id,
            type: nested.type,
            typeLabel: contentTypeLabel(nested.type),
            marker: nested.marker || "-",
            text: nested.text_exact || "",
          });
        }
      }
    } else if (child.type === "table_text") {
      blocks.push({
        id: child.id,
        type: child.type,
        typeLabel: contentTypeLabel(child.type),
        text: child.text_exact || "",
      });
    }
  }
  return blocks;
}

function buildTreeNodes(nodes, selectedId, details) {
  return nodes.map((node) => {
    if (node.section_number) {
      const id = node.section_number;
      return {
        id,
        label: `${node.section_number} ${node.section_title}`.trim(),
        meta: buildSectionMeta(node),
        type: node.parent_section_number ? "subsection" : "section",
        selected: id === selectedId,
        reviewStatus: details[id]?.reviewStatus || "unreviewed",
        children: buildTreeNodes(node.children || [], selectedId, details),
      };
    }

    if (node.type === "paragraph" || node.type === "table_text") {
      const id = node.id;
      const preview = (node.text_exact || "").slice(0, 88).trim();
      return {
        id,
        label: `${id} ${preview}`.trim(),
        meta: contentTypeLabel(node.type),
        type: node.type,
        selected: id === selectedId,
        reviewStatus: details[id]?.reviewStatus || "unreviewed",
        children: buildTreeNodes(node.children || [], selectedId, details),
      };
    }

    if (node.type === "bullet") {
      const id = node.id;
      const preview = (node.text_exact || "").slice(0, 88).trim();
      return {
        id,
        label: `${node.marker || "-"} ${preview}`.trim(),
        meta: "Bullet",
        type: "bullet",
        selected: id === selectedId,
        reviewStatus: details[id]?.reviewStatus || "unreviewed",
        children: [],
      };
    }

    return null;
  }).filter(Boolean);
}

function buildDetails(outline) {
  const details = {};
  let sectionCount = 0;
  let blockCount = 0;

  function walk(nodes, currentSection = null) {
    for (const node of nodes) {
      if (node.section_number) {
        sectionCount += 1;
        const sectionId = node.section_number;
        const blocks = sectionBlocks(node.children || []);
        details[sectionId] = {
          id: sectionId,
          title: `${node.section_number} ${node.section_title}`.trim(),
          context: currentSection ? `Nested under ${currentSection}` : "Top-level section",
          type: "section",
          typeLabel: "Section",
          reviewStatus: "unreviewed",
          reviewNote: "",
          metrics: [
            { label: "Section", value: node.section_number },
            { label: "Depth", value: String((node.section_number || "").split(".").length) },
            { label: "Direct blocks", value: String(blocks.length) },
          ],
          blocks,
        };
        blockCount += blocks.length;
        walk(node.children || [], `${node.section_number} ${node.section_title}`.trim());
        continue;
      }

      if (node.type === "paragraph" || node.type === "table_text") {
        const bullets = (node.children || []).filter((child) => child.type === "bullet" || child.type === "table_text");
        blockCount += 1;
        details[node.id] = {
          id: node.id,
          title: node.id,
          context: currentSection || "Unassigned section",
          type: node.type,
          typeLabel: contentTypeLabel(node.type),
          reviewStatus: "unreviewed",
          reviewNote: "",
          metrics: [
            { label: "Parent section", value: currentSection || "Unknown" },
            { label: "Child bullets", value: String(bullets.filter((child) => child.type === "bullet").length) },
            { label: "Node", value: node.id },
          ],
          blocks: [
            {
              id: node.id,
              type: node.type,
              typeLabel: contentTypeLabel(node.type),
              text: node.text_exact || "",
            },
            ...bullets.map((bullet) => ({
              id: bullet.id,
              type: bullet.type,
              typeLabel: contentTypeLabel(bullet.type),
              marker: bullet.marker || "-",
              text: bullet.text_exact || "",
            })),
          ],
        };
        blockCount += bullets.length;
      }
    }
  }

  walk(outline);
  return { details, sectionCount, blockCount };
}

function buildReviewQueue(details) {
  return Object.values(details)
    .filter((item) => item.type === "section" || item.type === "paragraph" || item.type === "table_text")
    .map((item) => ({
      id: item.id,
      title: item.title,
      context: item.context,
      typeLabel: item.typeLabel,
      reviewStatus: item.reviewStatus,
      reviewNote: item.reviewNote,
    }));
}

function statsFromDetails(sectionCount, blockCount, details) {
  const values = Object.values(details);
  const flaggedItems = values.filter((item) => item.reviewStatus === "needs-review" || item.reviewStatus === "bad-extract").length;
  const acceptedItems = values.filter((item) => item.reviewStatus === "accepted").length;
  return {
    sections: sectionCount,
    blocks: blockCount,
    reviewableItems: values.length,
    flaggedItems,
    acceptedItems,
  };
}

export function markSelectedTree(nodes, selectedId) {
  return nodes.map((node) => ({
    ...node,
    selected: node.id === selectedId,
    children: node.children?.length ? markSelectedTree(node.children, selectedId) : [],
  }));
}

export function buildWorkspace(payload) {
  const outline = payload.root_sections || [];
  const { details, sectionCount, blockCount } = buildDetails(outline);
  const selectedId = outline[0]?.section_number || Object.keys(details)[0] || null;

  return {
    primaryDocument: payload.filename || "Uploaded PWS",
    stats: statsFromDetails(sectionCount, blockCount, details),
    details,
    tree: buildTreeNodes(outline, selectedId, details),
    selectedId,
    reviewQueue: buildReviewQueue(details),
  };
}

export function setReviewStatus(workspace, itemId, updates) {
  const nextDetails = {
    ...workspace.details,
    [itemId]: {
      ...workspace.details[itemId],
      ...updates,
    },
  };

  return {
    ...workspace,
    details: nextDetails,
    stats: statsFromDetails(workspace.stats.sections, workspace.stats.blocks, nextDetails),
    tree: workspace.tree.map((node) => refreshTreeNode(node, itemId, nextDetails)),
    reviewQueue: buildReviewQueue(nextDetails),
  };
}

function refreshTreeNode(node, itemId, details) {
  const nextChildren = node.children?.length ? node.children.map((child) => refreshTreeNode(child, itemId, details)) : [];
  return {
    ...node,
    reviewStatus: details[node.id]?.reviewStatus || node.reviewStatus,
    children: nextChildren,
  };
}
