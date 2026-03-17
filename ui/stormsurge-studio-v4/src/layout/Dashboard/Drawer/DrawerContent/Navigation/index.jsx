import { useState } from 'react';

import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import HolderOutlined from '@ant-design/icons/HolderOutlined';

import NavGroup from './NavGroup';
import menuItem from 'menu-items';

import { useWorkspace } from 'contexts/WorkspaceContext';
import { getTopLevelSections } from 'utils/workspace';

function WorkspaceNavigation() {
  const { sections, selectedSectionId, setSelectedSectionId, reorderSections } = useWorkspace();
  const topLevelSections = getTopLevelSections(sections);
  const [draggedId, setDraggedId] = useState(null);
  const [dragTargetId, setDragTargetId] = useState(null);

  return (
    <List sx={{ pt: 2, pb: 0 }}>
      <Box sx={{ pl: 3, mb: 1.5 }}>
        <Typography variant="subtitle2" sx={{ color: 'rgba(55, 65, 81, 0.72)' }}>
          Sections
        </Typography>
      </Box>
      {topLevelSections.map((section) => {
        const isSelected = selectedSectionId === section.id;

        return (
          <ListItemButton
            key={section.id}
            draggable
            selected={isSelected}
            onClick={() => setSelectedSectionId(section.id)}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', section.id);
              setDraggedId(section.id);
              setSelectedSectionId(section.id);
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!draggedId || draggedId === section.id) return;
              setDragTargetId(section.id);
              reorderSections(null, draggedId, section.id);
            }}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={() => {
              if (!draggedId || draggedId === section.id) return;
              reorderSections(null, draggedId, section.id);
              setDragTargetId(null);
              setDraggedId(null);
            }}
            onDragEnd={() => {
              setDragTargetId(null);
              setDraggedId(null);
            }}
            sx={{
              px: 3,
              py: 1.1,
              opacity: draggedId === section.id ? 0.45 : 1,
              outline: dragTargetId === section.id && draggedId !== section.id ? '1px dashed rgba(70, 95, 255, 0.35)' : 'none',
              '&:hover': { bgcolor: 'rgba(15, 23, 42, 0.04)' },
              '&.Mui-selected': {
                bgcolor: 'rgba(15, 23, 42, 0.06)',
                borderRight: 'none',
                '&:hover': { bgcolor: 'rgba(15, 23, 42, 0.08)' }
              }
            }}
          >
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isSelected ? 'primary.main' : 'text.disabled',
                width: 16,
                minWidth: 16,
                mr: 1,
                cursor: draggedId === section.id ? 'grabbing' : 'grab'
              }}
            >
              <HolderOutlined style={{ fontSize: '0.8rem' }} />
            </Box>
            <ListItemText
              sx={{
                my: 0,
                mr: 1,
                minWidth: 0,
                '& .MuiTypography-root': {
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  whiteSpace: 'normal',
                  overflowWrap: 'anywhere',
                  lineHeight: 1.25
                }
              }}
              primary={
                <Typography
                  sx={{
                    color: isSelected ? '#111827' : 'rgba(55, 65, 81, 0.78)',
                    fontSize: '0.81rem',
                    fontWeight: isSelected ? 700 : 500,
                    letterSpacing: '-0.01em'
                  }}
                >
                  {section.label}
                </Typography>
              }
            />
          </ListItemButton>
        );
      })}
    </List>
  );
}

export default function Navigation() {
  const { sections } = useWorkspace();

  if (sections.length) {
    return <WorkspaceNavigation />;
  }

  const navGroups = menuItem.items.map((item) => {
    switch (item.type) {
      case 'group':
        return <NavGroup key={item.id} item={item} />;
      default:
        return (
          <Typography key={item.id} variant="h6" color="error" align="center">
            Fix - Navigation Group
          </Typography>
        );
    }
  });

  return <Box sx={{ pt: 2 }}>{navGroups}</Box>;
}
