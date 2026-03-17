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

const REQUIREMENT_ROW_GAP = 0;

function formatRequirementLabel(requirement) {
  return String(requirement.sourceRef || requirement.id || '')
    .toUpperCase()
    .replace(/\.P(\d+)/g, '.P$1')
    .replace(/\.B(\d+)/g, '.B$1');
}

function getRequirementLabelParts(requirement) {
  const label = formatRequirementLabel(requirement);
  const parts = label.split('.');

  return parts.map((part, index) => ({
    text: index === 0 ? part : `.${part}`,
    isMinor: /^[A-Z]\d+$/i.test(part)
  }));
}

function formatRequirementBody(requirement) {
  if (requirement.kind === 'table_text') {
    return String(requirement.summary || requirement.title || 'Table block').trim();
  }
  if (requirement.kind === 'image') {
    return String(requirement.caption || requirement.text || requirement.summary || requirement.title || 'Image block').trim();
  }
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
  depth = 0,
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
  const labelParts = getRequirementLabelParts(requirement);

  return (
    <Box
      {...dropProps}
      onClick={onSelect}
      sx={{
        opacity: isDragging ? 0.45 : 1,
        transform: isDragging ? 'scale(0.997)' : 'scale(1)',
        transition: 'transform 160ms ease, opacity 160ms ease',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        bgcolor: isSelected ? 'rgba(70, 95, 255, 0.05)' : 'transparent',
        borderBottom: '1px solid',
        borderBottomColor: 'rgba(226, 232, 240, 0.55)',
        outline: isDragTarget ? '1px dashed rgba(70, 95, 255, 0.35)' : 'none',
        '&:hover': {
          bgcolor: isSelected ? 'rgba(70, 95, 255, 0.05)' : 'rgba(248, 250, 252, 0.7)'
        }
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'stretch',
          width: '100%',
          minHeight: 42,
          pl: 0.75 + depth * 1.95,
          pr: 1.5,
          py: 0.85,
          position: 'relative'
        }}
      >
        <Box
          sx={{
            width: childCount > 0 ? 22 : 18,
            minWidth: childCount > 0 ? 22 : 18,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: childCount > 0 ? 'rgba(100, 116, 139, 0.78)' : 'transparent',
            ml: 0,
            mr: 0.35
          }}
        >
          {childCount > 0 ? (
            <IconButton
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                onToggleCollapse?.();
              }}
              sx={{
                width: 15,
                height: 16,
                p: 0,
                color: 'inherit',
                transition: 'transform 220ms ease',
                transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'
              }}
            >
              <DownOutlined style={{ fontSize: '0.54rem' }} />
            </IconButton>
          ) : (
            <Box sx={{ width: 16, height: 16 }} />
          )}
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
            mr: 1,
            whiteSpace: 'nowrap',
            transform: 'translateY(2px)'
          }}
        >
          {labelParts.map((part) => (
            <Box
              component="span"
              key={`${requirement.id}-${part.text}`}
              sx={{
                fontSize: part.isMinor ? '0.72em' : '1em',
                lineHeight: 1,
                display: 'inline-flex',
                alignItems: 'center'
              }}
            >
              {part.text}
            </Box>
          ))}
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
            transform: 'translateY(1px)',
            pr: 1
          }}
        >
          {formatRequirementBody(requirement)}
        </Box>
        <Box
          {...dragHandleProps}
          sx={{
            display: { xs: 'none', sm: 'inline-flex' },
            alignItems: 'center',
            justifyContent: 'center',
            color: isSelected ? 'primary.main' : 'text.disabled',
            width: 16,
            minWidth: 16,
            flexShrink: 0,
            alignSelf: 'center',
            cursor: isDragging ? 'grabbing' : 'grab',
            transform: 'translateY(0.45px)',
            ml: 'auto'
          }}
        >
          <HolderOutlined style={{ fontSize: '0.8rem' }} />
        </Box>
      </Box>
    </Box>
  );
}

function SectionCard({
  dragHandleProps,
  dropProps,
  hasCollapse = false,
  isCollapsed,
  isDragging,
  isDragTarget,
  isSelected,
  onSelect,
  onToggleCollapse,
  section
}) {
  return (
    <Box
      {...dropProps}
      onClick={onSelect}
      sx={{
        opacity: isDragging ? 0.45 : 1,
        transform: isDragging ? 'scale(0.998)' : 'scale(1)',
        transition: 'transform 160ms ease, opacity 160ms ease',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        bgcolor: 'transparent',
        outline: isDragTarget ? '1px dashed rgba(70, 95, 255, 0.35)' : 'none',
        '&:hover': {
          bgcolor: 'rgba(248, 250, 252, 0.45)'
        }
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'stretch',
          width: '100%',
          minHeight: 34,
          pl: 0.75,
          pr: 1.5,
          pt: 1.05,
          pb: 0.45
        }}
      >
        <Box sx={{ width: 20, minWidth: 20, mr: 0.35, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          {hasCollapse ? (
            <IconButton
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                onToggleCollapse?.();
              }}
              sx={{
                width: 22,
                height: 16,
                p: 0,
                color: 'rgba(71, 85, 105, 0.88)',
                transition: 'transform 220ms ease',
                transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'
              }}
            >
              <DownOutlined style={{ fontSize: '0.58rem' }} />
            </IconButton>
          ) : null}
        </Box>
        <Typography
          variant="body1"
          sx={{
            fontFamily: "'Public Sans', sans-serif",
            display: 'flex',
            alignItems: 'center',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'rgba(71, 85, 105, 0.88)',
            flexShrink: 0,
            lineHeight: 1,
            alignSelf: 'center',
            mr: 0.8,
            fontSize: '0.78rem'
          }}
        >
          {formatSectionTag(section)}
        </Typography>
        <Typography
          variant="body1"
          sx={{
            fontFamily: "'Public Sans', sans-serif",
            display: 'flex',
            alignItems: 'center',
            color: isSelected ? '#111827' : 'rgba(15, 23, 42, 0.9)',
            fontWeight: 600,
            lineHeight: 1.2,
            minWidth: 0,
            flex: 1,
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
            pr: 1,
            alignSelf: 'center',
            fontSize: '0.9rem'
          }}
        >
          {formatSectionBody(section)}
        </Typography>
        <Box
          {...dragHandleProps}
          sx={{
            display: { xs: 'none', sm: 'inline-flex' },
            alignItems: 'center',
            justifyContent: 'center',
            color: isSelected ? 'primary.main' : 'text.disabled',
            width: 16,
            minWidth: 16,
            flexShrink: 0,
            alignSelf: 'center',
            cursor: isDragging ? 'grabbing' : 'grab',
            transform: 'translateY(0.45px)',
            ml: 'auto'
          }}
        >
          <HolderOutlined style={{ fontSize: '0.8rem' }} />
        </Box>
      </Box>
    </Box>
  );
}

function RequirementTree({
  collapsedRequirementIds,
  depth = 0,
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
    <Stack sx={{ gap: REQUIREMENT_ROW_GAP }}>
      <RequirementCard
        childCount={childRequirements.length}
        depth={depth}
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
          <Stack sx={{ gap: 0, pl: 0, pt: 0, minHeight: 0 }}>
            {childRequirements.map((childRequirement) => (
              <RequirementTree
                collapsedRequirementIds={collapsedRequirementIds}
                depth={depth + 1}
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
  collapsedSectionIds,
  collapsedRequirementIds,
  depth = 0,
  draggedId,
  dragTargetId,
  moveRequirement,
  onRequirementSelect,
  reorderRequirements,
  requirements,
  sections,
  selectedRequirementId,
  setCollapsedRequirementIds,
  setCollapsedSectionIds,
  setDraggedId,
  setDragTargetId,
  subsection
}) {
  const childSections = getChildSections(sections, subsection.id);
  const sectionRequirements = getSectionRootRequirements(requirements, subsection.id);
  const hasChildren = sectionRequirements.length > 0 || childSections.length > 0;
  const isCollapsed = collapsedSectionIds.has(subsection.id);

  return (
    <Stack sx={{ gap: 0.25 }}>
      <SectionCard
        hasCollapse={hasChildren}
        dropProps={{
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
          }
        }}
        dragHandleProps={{
          draggable: true,
          onDragStart: (event) => {
            event.stopPropagation();
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', subsection.id);
            setDraggedId(subsection.id);
            onRequirementSelect(subsection.id);
          },
          onMouseDown: (event) => {
            event.stopPropagation();
          },
          onDragEnd: () => {
            setDragTargetId(null);
            setDraggedId(null);
          }
        }}
        isCollapsed={isCollapsed}
        section={subsection}
        isDragging={draggedId === subsection.id}
        isDragTarget={dragTargetId === subsection.id && draggedId !== subsection.id}
        isSelected={selectedRequirementId === subsection.id}
        onSelect={() => onRequirementSelect(subsection.id)}
        onToggleCollapse={() => {
          setCollapsedSectionIds((current) => {
            const next = new Set(current);
            if (next.has(subsection.id)) next.delete(subsection.id);
            else next.add(subsection.id);
            return next;
          });
        }}
      />
      <Box
        sx={{
          display: 'grid',
          gridTemplateRows: isCollapsed ? '0fr' : '1fr',
          opacity: isCollapsed ? 0 : 1,
          transition: 'grid-template-rows 220ms ease, opacity 180ms ease',
          overflow: 'hidden'
        }}
      >
        <Stack sx={{ gap: 0, pl: 0, minHeight: 0 }}>
        {sectionRequirements.map((requirement) => (
          <RequirementTree
            collapsedRequirementIds={collapsedRequirementIds}
            depth={depth + 1}
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
            collapsedSectionIds={collapsedSectionIds}
            collapsedRequirementIds={collapsedRequirementIds}
            depth={depth + 1}
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
            setCollapsedSectionIds={setCollapsedSectionIds}
            setDraggedId={setDraggedId}
            setDragTargetId={setDragTargetId}
            subsection={childSection}
          />
        ))}
        </Stack>
      </Box>
    </Stack>
  );
}

export default function DashboardDefault() {
  const {
    importError,
    isImporting,
    importDebug,
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
  const [collapsedSectionIds, setCollapsedSectionIds] = useState(() => new Set());
  const [draggedId, setDraggedId] = useState(null);
  const [dragTargetId, setDragTargetId] = useState(null);

  const selectedSection = sections.find((section) => section.id === selectedSectionId) || null;
  const visibleSubsections = useMemo(() => (selectedSectionId ? getChildSections(sections, selectedSectionId) : []), [sections, selectedSectionId]);
  const visibleRequirements = useMemo(
    () => (selectedSectionId ? getSectionRootRequirements(requirements, selectedSectionId) : []),
    [requirements, selectedSectionId]
  );
  const topSectionHasChildren = visibleRequirements.length > 0 || visibleSubsections.length > 0;
  const isTopSectionCollapsed = selectedSectionId ? collapsedSectionIds.has(selectedSectionId) : false;

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
          Use the top-right toolbar button to import a document.
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack sx={{ gap: 1.25 }}>
      {importError ? <Alert severity="error">{importError}</Alert> : null}
      {!importError && !isImporting && importDebug?.length ? (
        <Alert severity="info">
          Loaded {sourceFilename || 'document'} with {importDebug.length} artifact alignment decision
          {importDebug.length === 1 ? '' : 's'}.
        </Alert>
      ) : null}

      <Stack
        sx={{
          gap: 0,
          mx: { xs: -2, sm: -3 },
          bgcolor: 'background.paper'
        }}
      >
        {selectedSection ? (
          <SectionCard
            hasCollapse={topSectionHasChildren}
            dropProps={{}}
            dragHandleProps={{}}
            section={selectedSection}
            isCollapsed={isTopSectionCollapsed}
            isDragging={false}
            isDragTarget={false}
            isSelected={selectedRequirementId === selectedSection.id}
            onSelect={() => setSelectedRequirementId(selectedSection.id)}
            onToggleCollapse={() => {
              setCollapsedSectionIds((current) => {
                const next = new Set(current);
                if (next.has(selectedSection.id)) next.delete(selectedSection.id);
                else next.add(selectedSection.id);
                return next;
              });
            }}
          />
        ) : null}
        <Box
          sx={{
            display: 'grid',
            gridTemplateRows: isTopSectionCollapsed ? '0fr' : '1fr',
            opacity: isTopSectionCollapsed ? 0 : 1,
            transition: 'grid-template-rows 220ms ease, opacity 180ms ease',
            overflow: 'hidden'
          }}
        >
          <Stack sx={{ gap: 0, minHeight: 0 }}>
        {visibleRequirements.map((requirement) => (
          <RequirementTree
            collapsedRequirementIds={collapsedRequirementIds}
            depth={0}
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
                collapsedSectionIds={collapsedSectionIds}
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
                setCollapsedSectionIds={setCollapsedSectionIds}
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
        </Box>
      </Stack>
    </Stack>
  );
}
