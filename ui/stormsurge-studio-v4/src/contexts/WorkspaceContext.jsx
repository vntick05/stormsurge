import PropTypes from 'prop-types';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import {
  sanitizeImportedText,
  stripClassificationMarkings,
  stripEmbeddedLineNumberFragments,
  transformOutlineToWorkspace
} from 'utils/outline-transform';
import { getDescendantSectionIds } from 'utils/workspace';
import { stormApi } from 'services/storm';

const WorkspaceContext = createContext(null);
const WORKSPACE_STORAGE_KEY = 'stormsurge-studio-v4-workspace';

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getRequirementById(requirements, requirementId) {
  return requirements.find((requirement) => requirement.id === requirementId) || null;
}

function getChildRequirements(requirements, parentId) {
  return requirements
    .filter((requirement) => requirement.parentId === parentId)
    .sort((a, b) => (a.position || 0) - (b.position || 0));
}

function getGroupRequirements(requirements, sectionId, parentId) {
  return requirements
    .filter((requirement) => requirement.sectionId === sectionId && requirement.parentId === parentId)
    .sort((a, b) => (a.position || 0) - (b.position || 0));
}

function normalizeGroupPositions(requirements, sectionId, parentId) {
  const ordered = getGroupRequirements(requirements, sectionId, parentId);
  const nextPositions = new Map(ordered.map((requirement, index) => [requirement.id, index + 1]));

  return requirements.map((requirement) =>
    nextPositions.has(requirement.id)
      ? { ...requirement, position: nextPositions.get(requirement.id) }
      : requirement
  );
}

function normalizeAllPositions(requirements) {
  const groups = new Map();

  requirements.forEach((requirement) => {
    const key = `${requirement.sectionId}::${requirement.parentId ?? 'root'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(requirement);
  });

  const nextPositions = new Map();
  groups.forEach((group) => {
    group
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .forEach((requirement, index) => nextPositions.set(requirement.id, index + 1));
  });

  return requirements.map((requirement) =>
    nextPositions.has(requirement.id)
      ? { ...requirement, position: nextPositions.get(requirement.id) }
      : requirement
  );
}

function getDescendantIds(requirements, requirementId) {
  const children = getChildRequirements(requirements, requirementId);
  return children.flatMap((child) => [child.id, ...getDescendantIds(requirements, child.id)]);
}

function deleteRequirementTree(requirements, requirementId) {
  const idsToDelete = new Set([requirementId, ...getDescendantIds(requirements, requirementId)]);
  return requirements.filter((requirement) => !idsToDelete.has(requirement.id));
}

function buildRequirementClipboard(requirements, requirementId) {
  const rootRequirement = getRequirementById(requirements, requirementId);
  if (!rootRequirement) return null;

  const subtreeIds = new Set([requirementId, ...getDescendantIds(requirements, requirementId)]);
  const items = requirements
    .filter((requirement) => subtreeIds.has(requirement.id))
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((requirement) => ({ ...requirement }));

  return {
    rootId: requirementId,
    items
  };
}

function cloneRequirementClipboard(clipboard, sectionId, parentId, insertIndex, requirements) {
  if (!clipboard?.items?.length) {
    return { nextRequirements: requirements, insertedRootId: null };
  }

  const targetGroup = getGroupRequirements(requirements, sectionId, parentId);
  const nextIndex = Math.min(Math.max(insertIndex, 0), targetGroup.length);
  const clonedByOldId = new Map();

  clipboard.items.forEach((item) => {
    clonedByOldId.set(item.id, {
      ...item,
      id: createId(item.kind || 'requirement'),
      sectionId,
      parentId: item.id === clipboard.rootId ? parentId : item.parentId,
      position: item.position || 1
    });
  });

  clipboard.items.forEach((item) => {
    const clone = clonedByOldId.get(item.id);
    if (!clone) return;
    if (item.id === clipboard.rootId) {
      clone.parentId = parentId;
      return;
    }
    clone.parentId = clonedByOldId.get(item.parentId)?.id || parentId;
  });

  const insertedRoot = clonedByOldId.get(clipboard.rootId);
  const nextGroup = [...targetGroup];
  nextGroup.splice(nextIndex, 0, insertedRoot);
  nextGroup.forEach((requirement, index) => {
    requirement.position = index + 1;
  });

  const nextRequirements = normalizeAllPositions([
    ...requirements.filter((requirement) => !(requirement.sectionId === sectionId && requirement.parentId === parentId)),
    ...nextGroup,
    ...clipboard.items
      .filter((item) => item.id !== clipboard.rootId)
      .map((item) => clonedByOldId.get(item.id))
  ]);

  return { nextRequirements, insertedRootId: insertedRoot.id };
}

function getNextChildSectionNumber(sections, parentSection) {
  const parentNumber = String(parentSection?.sectionNumber || '').trim();
  if (!parentNumber) return '';

  const childNumbers = sections
    .filter((section) => section.parentId === parentSection.id)
    .map((section) => String(section.sectionNumber || '').trim())
    .filter((value) => value.startsWith(`${parentNumber}.`))
    .map((value) => Number(value.slice(parentNumber.length + 1).split('.')[0]))
    .filter((value) => Number.isFinite(value));

  const nextNumber = childNumbers.length ? Math.max(...childNumbers) + 1 : 1;
  return `${parentNumber}.${nextNumber}`;
}

function getNextTopLevelSectionPosition(sections) {
  return sections.filter((section) => !section.parentId).length + 1;
}

function buildSectionFromRequirement(requirement) {
  const sectionTag = String(requirement.sourceRef || '').trim().toUpperCase();
  const sectionBody = stripClassificationMarkings(
    String(requirement.text || requirement.summary || requirement.title || '').replace(/\s+/g, ' ').trim()
  );

  return {
    shortLabel: 'NEW',
    label: sectionBody || 'New Section',
    sectionNumber: null
  };
}

function buildSectionFromSection(section) {
  const rawLabel = String(section.label || '').trim();
  const sectionNumber = String(section.sectionNumber || '').trim();
  const label = sectionNumber && rawLabel.startsWith(sectionNumber) ? rawLabel.slice(sectionNumber.length).trim() || rawLabel : rawLabel;

  return {
    shortLabel: 'NEW',
    label: label || 'New Section',
    sectionNumber: null
  };
}

function sanitizeStoredRequirements(requirements) {
  return (Array.isArray(requirements) ? requirements : []).map((requirement) => ({
    ...requirement,
    text: stripEmbeddedLineNumberFragments(sanitizeImportedText(requirement.text || '')),
    summary: stripEmbeddedLineNumberFragments(sanitizeImportedText(requirement.summary || '')),
    title: stripEmbeddedLineNumberFragments(sanitizeImportedText(requirement.title || ''))
  }));
}

function sanitizeStoredSections(sections) {
  return (Array.isArray(sections) ? sections : []).map((section, index) => ({
    ...section,
    label: sanitizeImportedText(section.label || ''),
    position: section.position || index + 1
  }));
}

function loadStoredWorkspace() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return {
      requirements: sanitizeStoredRequirements(parsed.requirements),
      sections: sanitizeStoredSections(parsed.sections),
      selectedRequirementId: parsed.selectedRequirementId || null,
      selectedSectionId: parsed.selectedSectionId || null,
      sourceFilename: parsed.sourceFilename || null,
      sourceFormat: parsed.sourceFormat || null,
      projectId: parsed.projectId || null,
      importDebug: Array.isArray(parsed.importDebug) ? parsed.importDebug : []
    };
  } catch {
    return null;
  }
}

export function WorkspaceProvider({ children }) {
  const storedWorkspace = loadStoredWorkspace();
  const [sections, setSections] = useState(storedWorkspace?.sections || []);
  const [requirements, setRequirements] = useState(storedWorkspace?.requirements || []);
  const [selectedSectionId, setSelectedSectionId] = useState(storedWorkspace?.selectedSectionId || null);
  const [selectedRequirementId, setSelectedRequirementId] = useState(storedWorkspace?.selectedRequirementId || null);
  const [sourceFilename, setSourceFilename] = useState(storedWorkspace?.sourceFilename || null);
  const [sourceFormat, setSourceFormat] = useState(storedWorkspace?.sourceFormat || null);
  const [projectId, setProjectId] = useState(storedWorkspace?.projectId || null);
  const [importDebug, setImportDebug] = useState(storedWorkspace?.importDebug || []);
  const [requirementClipboard, setRequirementClipboard] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isRichImporting, setIsRichImporting] = useState(false);
  const [importError, setImportError] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const payload = {
      requirements,
      sections,
      selectedRequirementId,
      selectedSectionId,
      sourceFilename,
      sourceFormat,
      projectId,
      importDebug
    };

    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(payload));
  }, [requirements, sections, selectedRequirementId, selectedSectionId, sourceFilename, sourceFormat, projectId, importDebug]);

  const importDocument = async (file) => {
    setIsImporting(true);
    setImportError(null);

    try {
      const payload = await stormApi.importDocument(file);
      const workspace = transformOutlineToWorkspace(payload);

      setSections(workspace.sections);
      setRequirements(workspace.requirements);
      setSourceFilename(workspace.sourceFilename || file.name);
      setSourceFormat(workspace.sourceFormat || payload.format || null);
      setProjectId(workspace.projectId || payload.project_id || null);
      setImportDebug(workspace.importDebug || payload.alignment_debug || []);
      setSelectedSectionId(workspace.sections[0]?.id || null);
      setSelectedRequirementId(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Document import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const importRichArtifact = async (file) => {
    setIsRichImporting(true);
    setImportError(null);

    try {
      return await stormApi.importRichArtifact(file);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Rich import failed');
      return null;
    } finally {
      setIsRichImporting(false);
    }
  };

  const reorderSectionRequirements = (sectionId, activeId, targetId) => {
    if (!sectionId || !activeId || !targetId || activeId === targetId) return;

    setRequirements((currentRequirements) => {
      const rootRequirements = currentRequirements
        .filter((requirement) => requirement.sectionId === sectionId && requirement.parentId === null)
        .sort((a, b) => (a.position || 0) - (b.position || 0));

      const activeIndex = rootRequirements.findIndex((requirement) => requirement.id === activeId);
      const targetIndex = rootRequirements.findIndex((requirement) => requirement.id === targetId);

      if (activeIndex === -1 || targetIndex === -1) return currentRequirements;

      const nextRootRequirements = [...rootRequirements];
      const [movedRequirement] = nextRootRequirements.splice(activeIndex, 1);
      nextRootRequirements.splice(targetIndex, 0, movedRequirement);

      const nextPositions = new Map(nextRootRequirements.map((requirement, index) => [requirement.id, index + 1]));

      return currentRequirements.map((requirement) =>
        nextPositions.has(requirement.id)
          ? { ...requirement, position: nextPositions.get(requirement.id) }
          : requirement
      );
    });
  };

  const reorderRequirementSiblings = (sectionId, parentId, activeId, targetId) => {
    if (!sectionId || !activeId || !targetId || activeId === targetId) return;

    setRequirements((currentRequirements) => {
      const siblingRequirements = currentRequirements
        .filter((requirement) => requirement.sectionId === sectionId && requirement.parentId === parentId)
        .sort((a, b) => (a.position || 0) - (b.position || 0));

      const activeIndex = siblingRequirements.findIndex((requirement) => requirement.id === activeId);
      const targetIndex = siblingRequirements.findIndex((requirement) => requirement.id === targetId);
      if (activeIndex === -1 || targetIndex === -1) return currentRequirements;

      const nextSiblings = [...siblingRequirements];
      const [movedRequirement] = nextSiblings.splice(activeIndex, 1);
      nextSiblings.splice(targetIndex, 0, movedRequirement);

      const nextPositions = new Map(nextSiblings.map((requirement, index) => [requirement.id, index + 1]));
      return currentRequirements.map((requirement) =>
        nextPositions.has(requirement.id) ? { ...requirement, position: nextPositions.get(requirement.id) } : requirement
      );
    });
  };

  const reorderSections = (parentId, activeId, targetId) => {
    if (!activeId || !targetId || activeId === targetId) return;

    setSections((currentSections) => {
      const siblingSections = currentSections
        .filter((section) => section.parentId === parentId)
        .sort((a, b) => (a.position || 0) - (b.position || 0));

      const activeIndex = siblingSections.findIndex((section) => section.id === activeId);
      const targetIndex = siblingSections.findIndex((section) => section.id === targetId);
      if (activeIndex === -1 || targetIndex === -1) return currentSections;

      const nextSiblings = [...siblingSections];
      const [movedSection] = nextSiblings.splice(activeIndex, 1);
      nextSiblings.splice(targetIndex, 0, movedSection);

      const nextPositions = new Map(nextSiblings.map((section, index) => [section.id, index + 1]));
      return currentSections.map((section) => (nextPositions.has(section.id) ? { ...section, position: nextPositions.get(section.id) } : section));
    });
  };

  const selectedRequirement = getRequirementById(requirements, selectedRequirementId);
  const selectedSection = sections.find((section) => section.id === selectedSectionId) || null;
  const selectedSectionNode = sections.find((section) => section.id === selectedRequirementId) || null;
  const activeSection = selectedSectionNode || (selectedRequirement ? sections.find((section) => section.id === selectedRequirement.sectionId) : null) || selectedSection;

  const addNewRequirement = () => {
    if (!activeSection) return;

    setRequirements((currentRequirements) => {
      const sectionId = selectedRequirement?.sectionId || activeSection.id;
      const parentId = selectedRequirement?.parentId ?? null;
      const siblings = getGroupRequirements(currentRequirements, sectionId, parentId);
      const insertIndex = selectedRequirement ? siblings.findIndex((requirement) => requirement.id === selectedRequirement.id) + 1 : siblings.length;

      const nextRequirement = {
        id: createId('requirement'),
        sectionId,
        parentId,
        position: insertIndex + 1,
        sourceRef: 'NEW',
        kind: 'paragraph',
        title: 'New Requirement',
        summary: 'New requirement',
        text: 'New requirement'
      };

      const nextSiblings = [...siblings];
      nextSiblings.splice(Math.max(insertIndex, 0), 0, nextRequirement);
      nextSiblings.forEach((requirement, index) => {
        requirement.position = index + 1;
      });

      return [
        ...currentRequirements.filter((requirement) => !(requirement.sectionId === sectionId && requirement.parentId === parentId)),
        ...nextSiblings
      ];
    });
  };

  const addChildRequirement = () => {
    if (!selectedRequirement) return;

    setRequirements((currentRequirements) => {
      const childRequirements = getChildRequirements(currentRequirements, selectedRequirement.id);
      const nextChild = {
        id: createId('requirement'),
        sectionId: selectedRequirement.sectionId,
        parentId: selectedRequirement.id,
        position: 1,
        sourceRef: 'NEW',
        kind: 'paragraph',
        title: 'New Child Requirement',
        summary: 'New child requirement',
        text: 'New child requirement'
      };

      const nextChildren = [nextChild, ...childRequirements];
      nextChildren.forEach((requirement, index) => {
        requirement.position = index + 1;
      });

      return [
        ...currentRequirements.filter(
          (requirement) => !(requirement.sectionId === selectedRequirement.sectionId && requirement.parentId === selectedRequirement.id)
        ),
        ...nextChildren
      ];
    });
  };

  const createSection = () => {
    if (!selectedRequirement && !selectedSectionNode) return;

    if (selectedSectionNode) {
      const nextSection = buildSectionFromSection(selectedSectionNode);
      const promptedLabel =
        typeof window !== 'undefined' ? window.prompt('Name this new section', nextSection.label || 'New Section') : nextSection.label;
      const sectionLabel = String(promptedLabel || '').trim() || nextSection.label || 'New Section';
      const sectionIds = new Set([selectedSectionNode.id, ...getDescendantSectionIds(sections, selectedSectionNode.id)]);

      setSections((currentSections) =>
        currentSections.map((section) => {
          if (!sectionIds.has(section.id)) return section;

          if (section.id === selectedSectionNode.id) {
            return {
              ...section,
              label: sectionLabel,
              shortLabel: 'NEW',
              sectionNumber: null,
              parentId: null,
              depth: 0,
              position: getNextTopLevelSectionPosition(currentSections)
            };
          }

          return {
            ...section,
            depth: Math.max(1, (section.depth || 0) - ((selectedSectionNode.depth || 0) - 1))
          };
        })
      );

      setSelectedSectionId(selectedSectionNode.id);
      setSelectedRequirementId(null);
      return;
    }

    const nextSectionId = createId('section');
    const nextSection = buildSectionFromRequirement(selectedRequirement);
    const promptedLabel =
      typeof window !== 'undefined' ? window.prompt('Name this new section', nextSection.label || 'New Section') : nextSection.label;
    const sectionLabel = String(promptedLabel || '').trim() || nextSection.label || 'New Section';

    setSections((currentSections) => [
      ...currentSections,
      {
        id: nextSectionId,
        label: sectionLabel,
        shortLabel: nextSection.shortLabel,
        sectionNumber: nextSection.sectionNumber,
        parentId: null,
        depth: 0,
        position: getNextTopLevelSectionPosition(currentSections)
      }
    ]);

    setRequirements((currentRequirements) => {
      const subtreeIds = new Set([selectedRequirement.id, ...getDescendantIds(currentRequirements, selectedRequirement.id)]);

      const migrated = currentRequirements.map((requirement) => {
        if (!subtreeIds.has(requirement.id)) return requirement;

        return {
          ...requirement,
          sectionId: nextSectionId,
          parentId: requirement.id === selectedRequirement.id ? null : requirement.parentId,
          position: requirement.id === selectedRequirement.id ? 1 : requirement.position
        };
      });

      return normalizeAllPositions(migrated);
    });

    setSelectedSectionId(nextSectionId);
    setSelectedRequirementId(null);
  };

  const promoteRequirementItem = () => {
    if (!selectedRequirement?.parentId) return;

    setRequirements((currentRequirements) => {
      const currentRequirement = getRequirementById(currentRequirements, selectedRequirement.id);
      const parentRequirement = getRequirementById(currentRequirements, currentRequirement.parentId);
      if (!currentRequirement || !parentRequirement) return currentRequirements;

      const updated = currentRequirements.map((requirement) =>
        requirement.id === currentRequirement.id
          ? { ...requirement, parentId: parentRequirement.parentId, sectionId: parentRequirement.sectionId, position: 9999 }
          : requirement
      );

      return normalizeAllPositions(updated);
    });
  };

  const demoteRequirementItem = () => {
    if (!selectedRequirement) return;

    setRequirements((currentRequirements) => {
      const currentRequirement = getRequirementById(currentRequirements, selectedRequirement.id);
      if (!currentRequirement) return currentRequirements;

      const siblings = getGroupRequirements(currentRequirements, currentRequirement.sectionId, currentRequirement.parentId);
      const currentIndex = siblings.findIndex((requirement) => requirement.id === currentRequirement.id);
      if (currentIndex <= 0) return currentRequirements;

      const previousSibling = siblings[currentIndex - 1];
      const nextPosition = getChildRequirements(currentRequirements, previousSibling.id).length + 1;
      const updated = currentRequirements.map((requirement) =>
        requirement.id === currentRequirement.id
          ? { ...requirement, parentId: previousSibling.id, position: nextPosition }
          : requirement
      );

      return normalizeAllPositions(updated);
    });
  };

  const cutRequirement = () => {
    if (!selectedRequirement) return;

    setRequirementClipboard(buildRequirementClipboard(requirements, selectedRequirement.id));
    setRequirements((currentRequirements) => deleteRequirementTree(currentRequirements, selectedRequirement.id));
    setSelectedRequirementId(null);
  };

  const copyRequirement = () => {
    if (!selectedRequirement) return;

    setRequirementClipboard(buildRequirementClipboard(requirements, selectedRequirement.id));
  };

  const pasteBelowRequirement = () => {
    if (!selectedRequirement || !requirementClipboard) return;

    setRequirements((currentRequirements) => {
      const currentRequirement = getRequirementById(currentRequirements, selectedRequirement.id);
      if (!currentRequirement) return currentRequirements;

      const targetGroup = getGroupRequirements(currentRequirements, currentRequirement.sectionId, currentRequirement.parentId);
      const targetIndex = targetGroup.findIndex((requirement) => requirement.id === currentRequirement.id);
      const { nextRequirements, insertedRootId } = cloneRequirementClipboard(
        requirementClipboard,
        currentRequirement.sectionId,
        currentRequirement.parentId,
        targetIndex + 1,
        currentRequirements
      );
      if (insertedRootId) setSelectedRequirementId(insertedRootId);
      return nextRequirements;
    });
  };

  const pasteAsChildRequirement = () => {
    if (!selectedRequirement || !requirementClipboard) return;

    setRequirements((currentRequirements) => {
      const currentRequirement = getRequirementById(currentRequirements, selectedRequirement.id);
      if (!currentRequirement) return currentRequirements;

      const insertIndex = getChildRequirements(currentRequirements, currentRequirement.id).length;
      const { nextRequirements, insertedRootId } = cloneRequirementClipboard(
        requirementClipboard,
        currentRequirement.sectionId,
        currentRequirement.id,
        insertIndex,
        currentRequirements
      );
      if (insertedRootId) setSelectedRequirementId(insertedRootId);
      return nextRequirements;
    });
  };

  const deleteRequirementItem = () => {
    if (!selectedRequirement) return;

    setRequirements((currentRequirements) => deleteRequirementTree(currentRequirements, selectedRequirement.id));
    setSelectedRequirementId(null);
  };

  const value = useMemo(
    () => ({
      activeSection,
      addChildRequirement,
      addNewRequirement,
      createSection,
      copyRequirement,
      cutRequirement,
      deleteRequirementItem,
      demoteRequirementItem,
      hasRequirementClipboard: Boolean(requirementClipboard?.items?.length),
      importError,
      importDebug,
      importDocument,
      importRichArtifact,
      isImporting,
      isRichImporting,
      projectId,
      pasteAsChildRequirement,
      pasteBelowRequirement,
      promoteRequirementItem,
      reorderRequirementSiblings,
      reorderSections,
      reorderSectionRequirements,
      requirements,
      selectedRequirement,
      sections,
      selectedRequirementId,
      selectedSectionId,
      setSelectedRequirementId,
      setSelectedSectionId,
      sourceFormat,
      sourceFilename
    }),
    [
      activeSection,
      importError,
      importDebug,
      importDocument,
      importRichArtifact,
      isImporting,
      isRichImporting,
      projectId,
      requirementClipboard,
      requirements,
      sections,
      selectedRequirement,
      selectedRequirementId,
      selectedSectionId,
      sourceFormat,
      sourceFilename
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

WorkspaceProvider.propTypes = {
  children: PropTypes.node
};

export function useWorkspace() {
  const context = useContext(WorkspaceContext);

  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }

  return context;
}
