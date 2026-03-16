export function getTopLevelSections(sections) {
  return sections.filter((section) => !section.parentId);
}

export function getChildSections(sections, parentId) {
  return sections.filter((section) => section.parentId === parentId).sort((a, b) => {
    const aPosition = a.position || 0;
    const bPosition = b.position || 0;
    if (aPosition !== bPosition) return aPosition - bPosition;
    const aNumber = a.sectionNumber || '';
    const bNumber = b.sectionNumber || '';
    return aNumber.localeCompare(bNumber, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export function getDescendantSectionIds(sections, parentId) {
  const childSections = getChildSections(sections, parentId);
  return childSections.flatMap((section) => [section.id, ...getDescendantSectionIds(sections, section.id)]);
}

export function getSectionRootRequirements(requirements, sectionId) {
  return requirements
    .filter((requirement) => requirement.sectionId === sectionId && requirement.parentId === null)
    .sort((a, b) => (a.position || 0) - (b.position || 0));
}

export function getSectionRequirementCount(requirements, sectionId) {
  return requirements.filter((requirement) => requirement.sectionId === sectionId && requirement.parentId === null).length;
}

export function getChildRequirements(requirements, parentId) {
  return requirements
    .filter((requirement) => requirement.parentId === parentId)
    .sort((a, b) => (a.position || 0) - (b.position || 0));
}
