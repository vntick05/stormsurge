const DEFAULT_STATUS = "unreviewed";

function typeLabel(type) {
  if (type === "section") {
    return "Section";
  }
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

function summarizeSection(children) {
  const subsections = (children || []).filter((child) => child.section_number).length;
  const directBlocks = (children || []).filter((child) => child.type === "paragraph" || child.type === "table_text").length;
  return `${directBlocks} direct block${directBlocks === 1 ? "" : "s"} · ${subsections} subsection${subsections === 1 ? "" : "s"}`;
}

function flattenSectionBlocks(children) {
  const blocks = [];
  for (const child of children || []) {
    if (child.type === "paragraph" || child.type === "table_text") {
      blocks.push({
        id: child.id,
        type: child.type,
        typeLabel: typeLabel(child.type),
        text: child.text_exact || "",
      });
      for (const nested of child.children || []) {
        if (nested.type === "bullet" || nested.type === "table_text") {
          blocks.push({
            id: nested.id,
            type: nested.type,
            typeLabel: typeLabel(nested.type),
            text: nested.text_exact || "",
            marker: nested.marker || "-",
          });
        }
      }
    }
  }
  return blocks;
}

function buildTree(nodes, selectedId, reviewMap, details, context = null) {
  return (nodes || []).map((node) => {
    if (node.section_number) {
      const id = node.section_number;
      const nextContext = `${node.section_number} ${node.section_title}`.trim();
      const treeNode = {
        id,
        type: "section",
        label: nextContext,
        meta: summarizeSection(node.children || []),
        selected: id === selectedId,
        reviewStatus: reviewMap[id]?.status || DEFAULT_STATUS,
        children: buildTree(node.children || [], selectedId, reviewMap, details, nextContext),
      };
      details[id] = {
        id,
        type: "section",
        typeLabel: "Section",
        title: nextContext,
        context: context ? `Nested under ${context}` : "Top-level section",
        metrics: [
          { label: "Section", value: node.section_number },
          { label: "Depth", value: String(node.section_number.split(".").length) },
          { label: "Direct blocks", value: String(flattenSectionBlocks(node.children || []).length) },
        ],
        blocks: flattenSectionBlocks(node.children || []),
        reviewStatus: reviewMap[id]?.status || DEFAULT_STATUS,
        reviewNote: reviewMap[id]?.note || "",
      };
      return treeNode;
    }

    if (node.type === "paragraph" || node.type === "table_text") {
      const id = node.id;
      const childBullets = (node.children || []).filter((child) => child.type === "bullet" || child.type === "table_text");
      const treeNode = {
        id,
        type: node.type,
        label: `${id} ${(node.text_exact || "").slice(0, 84).trim()}`.trim(),
        meta: typeLabel(node.type),
        selected: id === selectedId,
        reviewStatus: reviewMap[id]?.status || DEFAULT_STATUS,
        children: buildTree(node.children || [], selectedId, reviewMap, details, context),
      };
      details[id] = {
        id,
        type: node.type,
        typeLabel: typeLabel(node.type),
        title: id,
        context: context || "Unassigned section",
        metrics: [
          { label: "Parent section", value: context || "Unknown" },
          { label: "Child bullets", value: String(childBullets.filter((child) => child.type === "bullet").length) },
          { label: "Node", value: id },
        ],
        blocks: [
          {
            id,
            type: node.type,
            typeLabel: typeLabel(node.type),
            text: node.text_exact || "",
          },
          ...childBullets.map((child) => ({
            id: child.id,
            type: child.type,
            typeLabel: typeLabel(child.type),
            text: child.text_exact || "",
            marker: child.marker || "-",
          })),
        ],
        reviewStatus: reviewMap[id]?.status || DEFAULT_STATUS,
        reviewNote: reviewMap[id]?.note || "",
      };
      return treeNode;
    }

    if (node.type === "bullet") {
      const id = node.id;
      const treeNode = {
        id,
        type: "bullet",
        label: `${node.marker || "-"} ${(node.text_exact || "").slice(0, 84).trim()}`.trim(),
        meta: "Bullet",
        selected: id === selectedId,
        reviewStatus: reviewMap[id]?.status || DEFAULT_STATUS,
        children: [],
      };
      details[id] = {
        id,
        type: "bullet",
        typeLabel: "Bullet",
        title: id,
        context: context || "Unassigned section",
        metrics: [
          { label: "Parent section", value: context || "Unknown" },
          { label: "Marker", value: node.marker || "-" },
          { label: "Node", value: id },
        ],
        blocks: [
          {
            id,
            type: "bullet",
            typeLabel: "Bullet",
            text: node.text_exact || "",
            marker: node.marker || "-",
          },
        ],
        reviewStatus: reviewMap[id]?.status || DEFAULT_STATUS,
        reviewNote: reviewMap[id]?.note || "",
      };
      return treeNode;
    }

    return null;
  }).filter(Boolean);
}

function countTree(nodes) {
  const counts = { sections: 0, blocks: 0 };
  for (const node of nodes || []) {
    if (node.type === "section") {
      counts.sections += 1;
    }
    if (node.type !== "section") {
      counts.blocks += 1;
    }
    const nested = countTree(node.children || []);
    counts.sections += nested.sections;
    counts.blocks += nested.blocks;
  }
  return counts;
}

function buildReviewQueue(details) {
  return Object.values(details)
    .filter((item) => item.type !== "bullet")
    .map((item) => ({
      id: item.id,
      title: item.title,
      context: item.context,
      typeLabel: item.typeLabel,
      reviewStatus: item.reviewStatus,
      reviewNote: item.reviewNote,
    }));
}

export function createWorkspace(payload, reviewMap = {}) {
  const details = {};
  const rootSections = payload.root_sections || [];
  const selectedId = rootSections[0]?.section_number || Object.keys(details)[0] || null;
  const tree = buildTree(rootSections, selectedId, reviewMap, details);
  const counts = countTree(tree);
  const queue = buildReviewQueue(details);
  const flaggedItems = queue.filter((item) => item.reviewStatus === "needs-review" || item.reviewStatus === "bad-extract").length;
  const acceptedItems = queue.filter((item) => item.reviewStatus === "accepted").length;

  return {
    filename: payload.filename || "No PWS loaded",
    selectedId: tree[0]?.id || null,
    tree,
    details,
    reviewMap,
    reviewQueue: queue,
    stats: {
      sections: counts.sections,
      blocks: counts.blocks,
      reviewableItems: queue.length,
      flaggedItems,
      acceptedItems,
    },
  };
}

export function emptyWorkspace() {
  return {
    filename: "No PWS loaded",
    selectedId: null,
    tree: [],
    details: {},
    reviewMap: {},
    reviewQueue: [],
    stats: {
      sections: 0,
      blocks: 0,
      reviewableItems: 0,
      flaggedItems: 0,
      acceptedItems: 0,
    },
  };
}

export function selectNode(workspace, id) {
  const mark = (nodes) =>
    nodes.map((node) => ({
      ...node,
      selected: node.id === id,
      children: mark(node.children || []),
    }));

  return {
    ...workspace,
    selectedId: id,
    tree: mark(workspace.tree),
  };
}

export function updateReview(workspace, id, patch) {
  const nextReviewMap = {
    ...workspace.reviewMap,
    [id]: {
      status: workspace.reviewMap[id]?.status || DEFAULT_STATUS,
      note: workspace.reviewMap[id]?.note || "",
      ...patch,
    },
  };

  const payload = {
    filename: workspace.filename,
    root_sections: rebuildPayloadSections(workspace.tree, workspace.details),
  };

  const rebuilt = createWorkspace(payload, nextReviewMap);
  return {
    ...rebuilt,
    selectedId: workspace.selectedId,
    tree: selectNode(rebuilt, workspace.selectedId).tree,
  };
}

function rebuildPayloadSections(treeNodes, details) {
  return (treeNodes || [])
    .filter((node) => node.type === "section")
    .map((node) => rebuildNode(node, details))
    .filter(Boolean);
}

function rebuildNode(treeNode, details) {
  const detail = details[treeNode.id];
  if (!detail) {
    return null;
  }

  if (treeNode.type === "section") {
    const parts = detail.title.split(" ");
    const sectionNumber = parts.shift() || treeNode.id;
    const sectionTitle = parts.join(" ");
    return {
      section_number: sectionNumber,
      section_title: sectionTitle,
      children: (treeNode.children || []).map((child) => rebuildNode(child, details)).filter(Boolean),
    };
  }

  if (treeNode.type === "paragraph" || treeNode.type === "table_text") {
    const [first, ...rest] = detail.blocks || [];
    return {
      type: treeNode.type,
      id: treeNode.id,
      text_exact: first?.text || "",
      children: (rest || []).map((item) => ({
        type: item.type,
        id: item.id,
        marker: item.marker,
        text_exact: item.text,
      })),
    };
  }

  if (treeNode.type === "bullet") {
    const first = detail.blocks?.[0];
    return {
      type: "bullet",
      id: treeNode.id,
      marker: first?.marker || "-",
      text_exact: first?.text || "",
    };
  }

  return null;
}
