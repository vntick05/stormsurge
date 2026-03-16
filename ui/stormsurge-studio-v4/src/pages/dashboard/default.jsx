import { useMemo, useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import DownOutlined from '@ant-design/icons/DownOutlined';
import HolderOutlined from '@ant-design/icons/HolderOutlined';
import UpOutlined from '@ant-design/icons/UpOutlined';

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

function RequirementCard({
  childCount = 0,
  dragHandleProps,
  dropProps,
  isCollapsed,
  isDragging,
  isDragTarget,
  isSelected,
  onSelect,
  onToggleCollapse,
  requirement
}) {
  return (
    <Box
      {...dropProps}
      sx={{
        opacity: isDragging ? 0.45 : 1,
        transform: isDragging ? 'scale(0.99)' : 'scale(1)',
        transition: 'transform 160ms ease, opacity 160ms ease'
      }}
    >
      <MainCard
        contentSX={{
          pl: 0.75,
          pr: 1.75,
          py: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          '&:last-child': {
            pb: 1
          }
        }}
        onClick={onSelect}
        sx={{
          borderRadius: 1,
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
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
            alignSelf: 'center',
            position: 'relative'
          }}
        >
          <Box
            {...dragHandleProps}
            sx={{
              display: { xs: 'none', sm: 'inline-flex' },
              alignItems: 'center',
              justifyContent: 'center',
              color: isSelected ? 'primary.main' : 'text.disabled',
              width: 16,
              flexShrink: 0,
              alignSelf: 'center',
              cursor: isDragging ? 'grabbing' : 'grab'
            }}
          >
            <HolderOutlined style={{ fontSize: '0.8rem' }} />
          </Box>
          <Box
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
              minHeight: 24,
              lineHeight: 1,
              alignSelf: 'center',
              mr: 0.8,
              whiteSpace: 'nowrap',
              transform: 'translateY(1px)'
            }}
          >
            {formatRequirementLabel(requirement)}
          </Box>
          <Box
            component="div"
            sx={{
              fontFamily: "'Visuelt Pro Light', sans-serif",
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              color: 'rgba(15, 23, 42, 0.82)',
              lineHeight: 1.15,
              minHeight: 24,
              minWidth: 0,
              alignSelf: 'center',
              transform: 'translateY(1px)'
            }}
          >
            {formatRequirementBody(requirement)}
          </Box>
          {childCount > 0 ? (
            <IconButton
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                onToggleCollapse?.();
              }}
              sx={{
                ml: 'auto',
                color: 'rgba(100, 116, 139, 0.7)',
                width: 16,
                height: 16,
                p: 0,
                transition: 'transform 220ms ease, color 180ms ease',
                transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)'
              }}
            >
              <DownOutlined style={{ fontSize: '0.58rem' }} />
            </IconButton>
          ) : null}
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
  collapsedRequirementIds,
  draggedId,
  dragTargetId,
  moveRequirement,
  onRequirementSelect,
  requirement,
  requirements,
  selectedRequirementId,
  setCollapsedRequirementIds,
  setDraggedId,
  setDragTargetId
}) {
  const childRequirements = getChildRequirements(requirements, requirement.id);
  const isCollapsed = collapsedRequirementIds.has(requirement.id);

  return (
    <Stack sx={{ gap: 0.75 }}>
      <RequirementCard
        childCount={childRequirements.length}
        requirement={requirement}
        isCollapsed={isCollapsed}
        isSelected={selectedRequirementId === requirement.id}
        isDragging={draggedId === requirement.id}
        isDragTarget={dragTargetId === requirement.id && draggedId !== requirement.id}
        onSelect={() => onRequirementSelect(requirement.id)}
        onToggleCollapse={() => {
          setCollapsedRequirementIds((current) => {
            const next = new Set(current);
            if (next.has(requirement.id)) next.delete(requirement.id);
            else next.add(requirement.id);
            return next;
          });
        }}
        dropProps={{
          onDragStart: () => {
            onRequirementSelect(requirement.id);
          },
          onDragEnter: (event) => {
            event.preventDefault();
            setDragTargetId(requirement.id);
            if (draggedId) {
              moveRequirement(requirement.sectionId, requirement.parentId, draggedId, requirement.id);
            }
          },
          onDragOver: (event) => {
            event.preventDefault();
          },
          onDrop: () => {
            if (draggedId) {
              moveRequirement(requirement.sectionId, requirement.parentId, draggedId, requirement.id);
            }
            setDragTargetId(null);
            setDraggedId(null);
          }
        }}
        dragHandleProps={{
          draggable: true,
          onDragStart: (event) => {
            event.stopPropagation();
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', requirement.id);
            setDraggedId(requirement.id);
            onRequirementSelect(requirement.id);
          },
          onMouseDown: (event) => {
            event.stopPropagation();
          },
          onDragEnd: () => {
            setDragTargetId(null);
            setDraggedId(null);
          }
        }}
      />
      {childRequirements.length ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateRows: isCollapsed ? '0fr' : '1fr',
            opacity: isCollapsed ? 0 : 1,
            transition: 'grid-template-rows 220ms ease, opacity 180ms ease',
            overflow: 'hidden'
          }}
        >
          <Stack sx={{ gap: 0.75, pl: { xs: 1, sm: 1.5 }, pt: 0.75, minHeight: 0 }}>
            {childRequirements.map((childRequirement) => (
              <RequirementTree
                collapsedRequirementIds={collapsedRequirementIds}
                key={childRequirement.id}
                draggedId={draggedId}
                dragTargetId={dragTargetId}
                moveRequirement={moveRequirement}
                onRequirementSelect={onRequirementSelect}
                requirement={childRequirement}
                requirements={requirements}
                selectedRequirementId={selectedRequirementId}
                setCollapsedRequirementIds={setCollapsedRequirementIds}
                setDraggedId={setDraggedId}
                setDragTargetId={setDragTargetId}
              />
            ))}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}

function SectionGroup({
  collapsedRequirementIds,
  draggedId,
  dragTargetId,
  moveRequirement,
  onRequirementSelect,
  reorderRequirements,
  requirements,
  sections,
  selectedRequirementId,
  setCollapsedRequirementIds,
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
            collapsedRequirementIds={collapsedRequirementIds}
            key={requirement.id}
            draggedId={draggedId}
            dragTargetId={dragTargetId}
            moveRequirement={moveRequirement}
            onRequirementSelect={onRequirementSelect}
            requirement={requirement}
            requirements={requirements}
            selectedRequirementId={selectedRequirementId}
            setCollapsedRequirementIds={setCollapsedRequirementIds}
            setDraggedId={setDraggedId}
            setDragTargetId={setDragTargetId}
          />
        ))}
        {childSections.map((childSection) => (
          <SectionGroup
            collapsedRequirementIds={collapsedRequirementIds}
            key={childSection.id}
            draggedId={draggedId}
            dragTargetId={dragTargetId}
            moveRequirement={moveRequirement}
            onRequirementSelect={onRequirementSelect}
            reorderRequirements={reorderRequirements}
            requirements={requirements}
            sections={sections}
            selectedRequirementId={selectedRequirementId}
            setCollapsedRequirementIds={setCollapsedRequirementIds}
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
  const [collapsedRequirementIds, setCollapsedRequirementIds] = useState(() => new Set());
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
            collapsedRequirementIds={collapsedRequirementIds}
            key={requirement.id}
            draggedId={draggedId}
            dragTargetId={dragTargetId}
            moveRequirement={moveRequirement}
            onRequirementSelect={setSelectedRequirementId}
            requirement={requirement}
            requirements={requirements}
            selectedRequirementId={selectedRequirementId}
            setCollapsedRequirementIds={setCollapsedRequirementIds}
            setDraggedId={setDraggedId}
            setDragTargetId={setDragTargetId}
          />
        ))}
        {visibleSubsections.length
          ? visibleSubsections.map((section) => (
              <SectionGroup
                collapsedRequirementIds={collapsedRequirementIds}
                key={section.id}
                draggedId={draggedId}
                dragTargetId={dragTargetId}
                moveRequirement={moveRequirement}
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
                setCollapsedRequirementIds={setCollapsedRequirementIds}
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
