import PropTypes from 'prop-types';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { stripClassificationMarkings, transformOutlineToWorkspace } from 'utils/outline-transform';
import { stormApi } from 'services/storm';

const WorkspaceContext = createContext(null);
const WORKSPACE_STORAGE_KEY = 'stormsurge-studio-v4-workspace';

function sanitizeStoredRequirements(requirements) {
  return (Array.isArray(requirements) ? requirements : []).map((requirement) => ({
    ...requirement,
    text: stripClassificationMarkings(requirement.text || ''),
    summary: stripClassificationMarkings(requirement.summary || ''),
    title: stripClassificationMarkings(requirement.title || '')
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
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      selectedRequirementId: parsed.selectedRequirementId || null,
      selectedSectionId: parsed.selectedSectionId || null,
      sourceFilename: parsed.sourceFilename || null
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
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const payload = {
      requirements,
      sections,
      selectedRequirementId,
      selectedSectionId,
      sourceFilename
    };

    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(payload));
  }, [requirements, sections, selectedRequirementId, selectedSectionId, sourceFilename]);

  const importOutline = async (file) => {
    setIsImporting(true);
    setImportError(null);

    try {
      const payload = await stormApi.importOutline(file);
      const workspace = transformOutlineToWorkspace(payload);

      setSections(workspace.sections);
      setRequirements(workspace.requirements);
      setSourceFilename(workspace.sourceFilename || file.name);
      setSelectedSectionId(workspace.sections[0]?.id || null);
      setSelectedRequirementId(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Outline upload failed');
    } finally {
      setIsImporting(false);
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

  const value = useMemo(
    () => ({
      importError,
      importOutline,
      isImporting,
      reorderSectionRequirements,
      requirements,
      sections,
      selectedRequirementId,
      selectedSectionId,
      setSelectedRequirementId,
      setSelectedSectionId,
      sourceFilename
    }),
    [importError, isImporting, requirements, sections, selectedRequirementId, selectedSectionId, sourceFilename]
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
