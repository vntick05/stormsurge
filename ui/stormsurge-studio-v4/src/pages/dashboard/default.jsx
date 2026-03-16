import { useMemo, useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import HolderOutlined from '@ant-design/icons/HolderOutlined';

import MainCard from 'components/MainCard';

import { useWorkspace } from 'contexts/WorkspaceContext';
import { getChildSections, getSectionRootRequirements } from 'utils/workspace';

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
          px: 1.75,
          py: 0.8,
          minHeight: 46,
          display: 'flex',
          alignItems: 'center',
          '&:last-child': {
            pb: 0.8
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
            gap: 1,
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
              width: 18,
              flexShrink: 0,
              alignSelf: 'center'
            }}
          >
            <HolderOutlined style={{ fontSize: '0.8rem' }} />
          </Box>
          <Typography
            variant="body1"
            sx={{
              fontFamily: "'Visuelt Pro Light', sans-serif",
              display: 'inline-flex',
              alignItems: 'center',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'text.secondary',
              flexShrink: 0,
              lineHeight: 1,
              alignSelf: 'center'
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
              color: 'text.primary',
              lineHeight: 1,
              minWidth: 0,
              alignSelf: 'center'
            }}
          >
            {formatRequirementBody(requirement)}
          </Typography>
        </Box>
      </MainCard>
    </Box>
  );
}

function SectionCard({ isSelected, onSelect, section }) {
  return (
    <Box
      onClick={onSelect}
      sx={{
        cursor: 'pointer',
        borderRadius: 1.5,
        px: 1.75,
        py: 0.65,
        minHeight: 42,
        bgcolor: isSelected ? 'rgba(70, 95, 255, 0.06)' : 'transparent',
        '&:hover': {
          bgcolor: isSelected ? 'rgba(70, 95, 255, 0.06)' : 'rgba(15, 23, 42, 0.04)'
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
        section={subsection}
        isSelected={selectedRequirementId === subsection.id}
        onSelect={() => onRequirementSelect(subsection.id)}
      />
      <Stack sx={{ gap: 0.75, pl: { xs: 0.5, sm: 0.75 } }}>
        {getSectionRootRequirements(requirements, subsection.id).map((requirement) => (
          <RequirementCard
            key={requirement.id}
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
                reorderRequirements(draggedId || requirement.id, requirement.id, subsection.id);
              },
              onDragOver: (event) => {
                event.preventDefault();
              },
              onDrop: () => {
                reorderRequirements(draggedId, requirement.id, subsection.id);
                setDragTargetId(null);
                setDraggedId(null);
              },
              onDragEnd: () => {
                setDragTargetId(null);
                setDraggedId(null);
              }
            }}
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
    reorderSectionRequirements,
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

  const moveCard = (activeId, targetId, sectionId = selectedSectionId) => {
    if (!sectionId) return;
    reorderSectionRequirements(sectionId, activeId, targetId);
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
        {visibleSubsections.length
          ? visibleSubsections.map((section) => (
              <SectionGroup
                key={section.id}
                draggedId={draggedId}
                dragTargetId={dragTargetId}
                onRequirementSelect={setSelectedRequirementId}
                reorderRequirements={moveCard}
                requirements={requirements}
                sections={sections}
                selectedRequirementId={selectedRequirementId}
                setDraggedId={setDraggedId}
                setDragTargetId={setDragTargetId}
                subsection={section}
              />
            ))
          : visibleRequirements.map((requirement) => (
              <RequirementCard
                key={requirement.id}
                requirement={requirement}
                isSelected={selectedRequirementId === requirement.id}
                isDragging={draggedId === requirement.id}
                isDragTarget={dragTargetId === requirement.id && draggedId !== requirement.id}
                onSelect={() => setSelectedRequirementId(requirement.id)}
                dragProps={{
                  draggable: true,
                  onDragStart: () => {
                    setDraggedId(requirement.id);
                    setSelectedRequirementId(requirement.id);
                  },
                  onDragEnter: (event) => {
                    event.preventDefault();
                    setDragTargetId(requirement.id);
                    moveCard(draggedId || requirement.id, requirement.id);
                  },
                  onDragOver: (event) => {
                    event.preventDefault();
                  },
                  onDrop: () => {
                    moveCard(draggedId, requirement.id);
                    setDragTargetId(null);
                    setDraggedId(null);
                  },
                  onDragEnd: () => {
                    setDragTargetId(null);
                    setDraggedId(null);
                  }
                }}
              />
            ))}
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
