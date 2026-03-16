function sortRequirements(items) {
  return [...items].sort((left, right) => {
    if (left.position !== right.position) {
      return left.position - right.position;
    }

    return left.title.localeCompare(right.title);
  });
}

export function getRequirementById(requirements, requirementId) {
  return requirements.find((requirement) => requirement.id === requirementId);
}

export function getChildren(requirements, parentId) {
  return sortRequirements(
    requirements.filter((requirement) => requirement.parentId === parentId),
  );
}

export function getSectionRoots(requirements, sectionId) {
  return sortRequirements(
    requirements.filter(
      (requirement) =>
        requirement.sectionId === sectionId && requirement.parentId === null,
    ),
  );
}

export function getDescendantIds(requirements, requirementId) {
  const descendants = [];
  const queue = [requirementId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const children = requirements.filter(
      (requirement) => requirement.parentId === currentId,
    );

    children.forEach((child) => {
      descendants.push(child.id);
      queue.push(child.id);
    });
  }

  return descendants;
}

export function getSiblingGroup(requirements, requirement) {
  return sortRequirements(
    requirements.filter(
      (candidate) =>
        candidate.sectionId === requirement.sectionId &&
        candidate.parentId === requirement.parentId,
    ),
  );
}

export function resequenceGroup(requirements, group) {
  const groupIds = new Set(group.map((item) => item.id));
  const nextPositions = new Map(group.map((item, index) => [item.id, index + 1]));

  return requirements.map((requirement) =>
    groupIds.has(requirement.id)
      ? { ...requirement, position: nextPositions.get(requirement.id) }
      : requirement,
  );
}

export function insertRequirementInGroup(
  requirements,
  draftRequirement,
  siblingGroup,
  insertIndex,
) {
  const clampedIndex = Math.max(0, Math.min(insertIndex, siblingGroup.length));
  const reordered = [...siblingGroup];
  reordered.splice(clampedIndex, 0, draftRequirement);
  const nextPositions = new Map(reordered.map((item, index) => [item.id, index + 1]));

  return [
    ...requirements.map((requirement) =>
      nextPositions.has(requirement.id)
        ? { ...requirement, position: nextPositions.get(requirement.id) }
        : requirement,
    ),
    { ...draftRequirement, position: nextPositions.get(draftRequirement.id) },
  ];
}

export function moveRequirement(requirements, requirementId, direction) {
  const current = getRequirementById(requirements, requirementId);
  if (!current) {
    return requirements;
  }

  const siblings = getSiblingGroup(requirements, current);
  const currentIndex = siblings.findIndex((item) => item.id === requirementId);
  const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex === -1 || swapIndex < 0 || swapIndex >= siblings.length) {
    return requirements;
  }

  const reordered = [...siblings];
  const [item] = reordered.splice(currentIndex, 1);
  reordered.splice(swapIndex, 0, item);
  return resequenceGroup(requirements, reordered);
}

export function promoteRequirement(requirements, requirementId) {
  const current = getRequirementById(requirements, requirementId);
  if (!current || current.parentId === null) {
    return requirements;
  }

  const parent = getRequirementById(requirements, current.parentId);
  const targetParentId = parent ? parent.parentId : null;
  const targetSiblings = sortRequirements(
    requirements.filter(
      (candidate) =>
        candidate.sectionId === current.sectionId &&
        candidate.parentId === targetParentId,
    ),
  );
  const nextPosition = targetSiblings.length + 1;

  return requirements.map((requirement) =>
    requirement.id === requirementId
      ? {
          ...requirement,
          parentId: targetParentId,
          position: nextPosition,
          kind: "top-level",
        }
      : requirement,
  );
}

export function demoteRequirement(requirements, requirementId) {
  const current = getRequirementById(requirements, requirementId);
  if (!current) {
    return requirements;
  }

  const siblings = getSiblingGroup(requirements, current);
  const currentIndex = siblings.findIndex((item) => item.id === requirementId);
  const previousSibling = siblings[currentIndex - 1];

  if (!previousSibling) {
    return requirements;
  }

  const targetChildren = getChildren(requirements, previousSibling.id);
  const nextPosition = targetChildren.length + 1;

  return requirements.map((requirement) =>
    requirement.id === requirementId
      ? {
          ...requirement,
          parentId: previousSibling.id,
          position: nextPosition,
          kind: "child",
        }
      : requirement,
  );
}

export function reassignRequirement(requirements, requirementId, nextSectionId) {
  const current = getRequirementById(requirements, requirementId);
  if (!current) {
    return requirements;
  }

  const descendants = new Set(getDescendantIds(requirements, requirementId));
  const rootTargetSiblings = getSectionRoots(requirements, nextSectionId);
  const nextPosition = rootTargetSiblings.length + 1;

  return requirements.map((requirement) => {
    if (requirement.id === requirementId) {
      return {
        ...requirement,
        sectionId: nextSectionId,
        parentId: null,
        position: nextPosition,
        kind: nextSectionId === "unassigned" ? "candidate" : "top-level",
      };
    }

    if (descendants.has(requirement.id)) {
      return {
        ...requirement,
        sectionId: nextSectionId,
      };
    }

    return requirement;
  });
}

export function deleteRequirement(requirements, requirementId) {
  const idsToDelete = new Set([requirementId, ...getDescendantIds(requirements, requirementId)]);
  return requirements.filter((requirement) => !idsToDelete.has(requirement.id));
}

export function createTopLevelRequirement(sectionId) {
  const idSuffix = Date.now();

  return {
    id: `req-${idSuffix}`,
    sectionId,
    parentId: null,
    position: 9999,
    sourceType: "manual",
    accentColor: "#5f8dff",
    sourceRef: "New Req",
    kind: "top-level",
    title: "New top-level requirement",
    summary: "Define the outcome, then refine the hierarchy around it.",
    text: "Describe the requirement in working form, then connect it to the right section strategy.",
    intent: "Draft",
  };
}

export function createChildRequirement(parentRequirement, requirements) {
  const childCount = getChildren(requirements, parentRequirement.id).length;
  const idSuffix = Date.now();

  return {
    id: `req-${idSuffix}`,
    sectionId: parentRequirement.sectionId,
    parentId: parentRequirement.id,
    position: childCount + 1,
    sourceType: "manual",
    accentColor: "#5f8dff",
    sourceRef: "New Req",
    kind: "child",
    title: "New child requirement",
    summary: "Break the parent requirement into a more specific obligation.",
    text: "Draft the supporting requirement that belongs under the selected parent.",
    intent: "Sub-requirement",
  };
}
