import { useMemo, useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import HolderOutlined from '@ant-design/icons/HolderOutlined';

import MainCard from 'components/MainCard';

import { useWorkspace } from 'contexts/WorkspaceContext';
import { getChildRequirements, getChildSections, getSectionRootRequirements } from 'utils/workspace';

function formatRequirementLabel(requirement) {
  return String(requirement.sourceRef || requirement.id || '')
    .toUpperCase()
    .replace(/\.P(\d+)/g, '.P$1')
    .replace(/\.B(\d+)/g, '.B$1');
}

function formatRequirementBody(requirement) {
  const body = String(requirement.text || requirement.summary || requirement.title || '').replace(/\s+/g, ' ').trim();
  return body || 'No requirement text extracted.';
}

function formatSectionTag(section) {
  return String(section.sectionNumber || section.shortLabel || '').toUpperCase();
}

function formatSectionBody(section) {
  const label = String(section.label || '').trim();
  const sectionNumber = String(section.sectionNumber || '').trim();
  if (sectionNumber && label.startsWith(sectionNumber)) {
    return label.slice(sectionNumber.length).trim() || label;
  }
  return label || 'Untitled Section';
}

function RequirementCard({ dragProps, isDragging, isDragTarget, isSelected, onSelect, requirement }) {
  return (
    <Box
      {...dragProps}
      sx={{
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.45 : 1,
        transform: isDragging ? 'scale(0.99)' : 'scale(1)',
        transition: 'transform 160ms ease, opacity 160ms ease'
      }}
    >
      <MainCard
        contentSX={{
          pl: 1.1,
          pr: 1.75,
          py: 'calc(0.8rem + 0.25px)',
          minHeight: 46,
          display: 'flex',
          alignItems: 'center',
          '&:last-child': {
            pb: 'calc(0.8rem + 0.25px)'
          }
        }}
        onClick={onSelect}
        sx={{
          borderRadius: 1,
          cursor: 'pointer',
          bgcolor: isSelected ? 'primary.lighter' : 'background.paper',
          boxShadow: isSelected ? '0 0 0 1px rgba(70, 95, 255, 0.24)' : undefined,
          outline: isDragTarget ? '1px dashed rgba(70, 95, 255, 0.4)' : 'none',
          '&:hover': {
            bgcolor: isSelected ? 'primary.lighter' : 'grey.50'
          }
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.65,
            width: '100%',
            minHeight: 28,
            alignSelf: 'center'
          }}
        >
          <Box
            sx={{
              display: { xs: 'none', sm: 'inline-flex' },
              alignItems: 'center',
              justifyContent: 'center',
              color: isSelected ? 'primary.main' : 'text.disabled',
              width: 16,
              flexShrink: 0,
              alignSelf: 'center'
            }}
          >
            <HolderOutlined style={{ fontSize: '0.8rem' }} />
          </Box>
          <Typography
            variant="body1"
            component="div"
            sx={{
              fontFamily: "'Visuelt Pro Light', sans-serif",
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'text.secondary',
              flexShrink: 0,
              height: 20,
              lineHeight: '20px',
              alignSelf: 'center',
              mr: 0.8,
              transform: 'translateY(1.5px)'
            }}
          >
            {formatRequirementLabel(requirement)}
          </Typography>
          <Typography
            variant="body1"
            sx={{
              fontFamily: "'Visuelt Pro Light', sans-serif",
              display: 'inline-flex',
              alignItems: 'center',
              color: 'rgba(15, 23, 42, 0.82)',
              lineHeight: 1,
              minWidth: 0,
              alignSelf: 'center',
              transform: 'translateY(1px)'
            }}
          >
            {formatRequirementBody(requirement)}
          </Typography>
        </Box>
      </MainCard>
    </Box>
  );
}

function SectionCard({ dragProps, isDragging, isDragTarget, isSelected, onSelect, section }) {
  return (
    <Box
      {...dragProps}
      onClick={onSelect}
      sx={{
        cursor: 'pointer',
        opacity: isDragging ? 0.45 : 1,
        outline: isDragTarget ? '1px dashed rgba(70, 95, 255, 0.4)' : 'none',
        borderRadius: 1.5,
        px: 1.75,
        py: 0.65,
        minHeight: 42,
        bgcolor: isSelected ? 'rgba(70, 95, 255, 0.06)' : 'transparent',
        '&:hover': {
          bgcolor: 'rgba(15, 23, 42, 0.04)'
        }
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          width: '100%',
          minHeight: 28
        }}
      >
        <Typography
          variant="body1"
          sx={{
            fontFamily: "'Public Sans', sans-serif",
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'text.secondary',
            flexShrink: 0,
            lineHeight: 1.2
          }}
        >
          {formatSectionTag(section)}
        </Typography>
        <Typography
          variant="body1"
          sx={{
            fontFamily: "'Public Sans', sans-serif",
            color: 'text.primary',
            fontWeight: 600,
            lineHeight: 1.2,
            minWidth: 0,
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
            pr: 1
          }}
        >
          {formatSectionBody(section)}
        </Typography>
      </Box>
    </Box>
  );
}

function RequirementTree({
  draggedId,
  dragTargetId,
  onRequirementSelect,
  reorderRequirements,
  requirement,
  requirements,
  selectedRequirementId,
  setDraggedId,
  setDragTargetId
}) {
  const childRequirements = getChildRequirements(requirements, requirement.id);

  return (
    <Stack sx={{ gap: 0.75 }}>
      <RequirementCard
        requirement={requirement}
        isSelected={selectedRequirementId === requirement.id}
        isDragging={draggedId === requirement.id}
        isDragTarget={dragTargetId === requirement.id && draggedId !== requirement.id}
        onSelect={() => onRequirementSelect(requirement.id)}
        dragProps={{
          draggable: true,
          onDragStart: () => {
            setDraggedId(requirement.id);
            onRequirementSelect(requirement.id);
          },
          onDragEnter: (event) => {
            event.preventDefault();
            setDragTargetId(requirement.id);
            reorderRequirements(requirement.id);
          },
          onDragOver: (event) => {
            event.preventDefault();
          },
          onDrop: () => {
            reorderRequirements(requirement.id, true);
            setDragTargetId(null);
            setDraggedId(null);
          },
          onDragEnd: () => {
            setDragTargetId(null);
            setDraggedId(null);
          }
        }}
      />
      {childRequirements.length ? (
        <Stack sx={{ gap: 0.75, pl: { xs: 1, sm: 1.5 } }}>
          {childRequirements.map((childRequirement) => (
            <RequirementTree
              key={childRequirement.id}
              draggedId={draggedId}
              dragTargetId={dragTargetId}
              onRequirementSelect={onRequirementSelect}
              reorderRequirements={reorderRequirements}
              requirement={childRequirement}
              requirements={requirements}
              selectedRequirementId={selectedRequirementId}
              setDraggedId={setDraggedId}
              setDragTargetId={setDragTargetId}
            />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

function SectionGroup({
  draggedId,
  dragTargetId,
  onRequirementSelect,
  reorderRequirements,
  requirements,
  sections,
  selectedRequirementId,
  setDraggedId,
  setDragTargetId,
  subsection
}) {
  const childSections = getChildSections(sections, subsection.id);

  return (
    <Stack sx={{ gap: 0.75 }}>
      <SectionCard
        dragProps={{
          draggable: true,
          onDragStart: () => {
            setDraggedId(subsection.id);
            onRequirementSelect(subsection.id);
          },
          onDragEnter: (event) => {
            event.preventDefault();
            setDragTargetId(subsection.id);
            reorderRequirements(subsection.id);
          },
          onDragOver: (event) => {
            event.preventDefault();
          },
          onDrop: () => {
            reorderRequirements(subsection.id, true);
            setDragTargetId(null);
            setDraggedId(null);
          },
          onDragEnd: () => {
            setDragTargetId(null);
            setDraggedId(null);
          }
        }}
        section={subsection}
        isDragging={draggedId === subsection.id}
        isDragTarget={dragTargetId === subsection.id && draggedId !== subsection.id}
        isSelected={selectedRequirementId === subsection.id}
        onSelect={() => onRequirementSelect(subsection.id)}
      />
      <Stack sx={{ gap: 0.75, pl: { xs: 1.5, sm: 2.25 } }}>
        {getSectionRootRequirements(requirements, subsection.id).map((requirement) => (
          <RequirementTree
            key={requirement.id}
            draggedId={draggedId}
            dragTargetId={dragTargetId}
            onRequirementSelect={onRequirementSelect}
            reorderRequirements={(targetId, isDrop = false) => {
              const activeId = draggedId || requirement.id;
              reorderRequirements(subsection.id, null, activeId, targetId);
              if (isDrop) return;
            }}
            requirement={requirement}
            requirements={requirements}
            selectedRequirementId={selectedRequirementId}
            setDraggedId={setDraggedId}
            setDragTargetId={setDragTargetId}
          />
        ))}
        {childSections.map((childSection) => (
          <SectionGroup
            key={childSection.id}
            draggedId={draggedId}
            dragTargetId={dragTargetId}
            onRequirementSelect={onRequirementSelect}
            reorderRequirements={reorderRequirements}
            requirements={requirements}
            sections={sections}
            selectedRequirementId={selectedRequirementId}
            setDraggedId={setDraggedId}
            setDragTargetId={setDragTargetId}
            subsection={childSection}
          />
        ))}
      </Stack>
    </Stack>
  );
}

export default function DashboardDefault() {
  const {
    importError,
    isImporting,
    reorderRequirementSiblings,
    reorderSections,
    requirements,
    sections,
    selectedRequirementId,
    selectedSectionId,
    setSelectedRequirementId,
    sourceFilename
  } = useWorkspace();
  const [draggedId, setDraggedId] = useState(null);
  const [dragTargetId, setDragTargetId] = useState(null);

  const selectedSection = sections.find((section) => section.id === selectedSectionId) || null;
  const visibleSubsections = useMemo(() => (selectedSectionId ? getChildSections(sections, selectedSectionId) : []), [sections, selectedSectionId]);
  const visibleRequirements = useMemo(
    () => (selectedSectionId ? getSectionRootRequirements(requirements, selectedSectionId) : []),
    [requirements, selectedSectionId]
  );

  const moveRequirement = (sectionId, parentId, activeId, targetId) => {
    if (!sectionId) return;
    reorderRequirementSiblings(sectionId, parentId, activeId, targetId);
  };

  const moveSection = (parentId, activeId, targetId) => {
    reorderSections(parentId, activeId, targetId);
  };

  if (!sections.length && !isImporting) {
    return (
      <Stack sx={{ gap: 2, alignItems: 'flex-start' }}>
        {importError ? <Alert severity="error">{importError}</Alert> : null}
        <Typography variant="body2" color="text.secondary">
          Use the top-right toolbar button to import a PWS outline.
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack sx={{ gap: 1.25 }}>
      {importError ? <Alert severity="error">{importError}</Alert> : null}

      <Stack sx={{ gap: 1 }}>
        {visibleRequirements.map((requirement) => (
          <RequirementTree
            key={requirement.id}
            draggedId={draggedId}
            dragTargetId={dragTargetId}
            onRequirementSelect={setSelectedRequirementId}
            reorderRequirements={(targetId) => moveRequirement(selectedSectionId, null, draggedId || requirement.id, targetId)}
            requirement={requirement}
            requirements={requirements}
            selectedRequirementId={selectedRequirementId}
            setDraggedId={setDraggedId}
            setDragTargetId={setDragTargetId}
          />
        ))}
        {visibleSubsections.length
          ? visibleSubsections.map((section) => (
              <SectionGroup
                key={section.id}
                draggedId={draggedId}
                dragTargetId={dragTargetId}
                onRequirementSelect={setSelectedRequirementId}
                reorderRequirements={(sectionId, parentId, activeId, targetId) => {
                  if (parentId === undefined) {
                    moveSection(selectedSectionId, draggedId || section.id, sectionId);
                    return;
                  }
                  moveRequirement(sectionId, parentId, activeId, targetId);
                }}
                requirements={requirements}
                sections={sections}
                selectedRequirementId={selectedRequirementId}
                setDraggedId={setDraggedId}
                setDragTargetId={setDragTargetId}
                subsection={section}
              />
            ))
          : null}
        {!isImporting && sections.length && !visibleSubsections.length && !visibleRequirements.length ? (
          <MainCard contentSX={{ p: 1.75 }}>
            <Typography variant="body2" color="text.secondary">
              No subsection or root requirement content was extracted for this section.
            </Typography>
          </MainCard>
        ) : null}
      </Stack>
    </Stack>
  );
}
