import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';

import NavGroup from './NavGroup';
import menuItem from 'menu-items';

import { useWorkspace } from 'contexts/WorkspaceContext';
import { getTopLevelSections } from 'utils/workspace';

function WorkspaceNavigation() {
  const { sections, selectedSectionId, setSelectedSectionId } = useWorkspace();
  const topLevelSections = getTopLevelSections(sections);

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
            selected={isSelected}
            onClick={() => setSelectedSectionId(section.id)}
            sx={{
              px: 3,
              py: 1.1,
              '&:hover': { bgcolor: 'rgba(15, 23, 42, 0.04)' },
              '&.Mui-selected': {
                bgcolor: 'transparent',
                borderRight: '3px solid',
                borderColor: 'primary.main',
                '&:hover': { bgcolor: 'rgba(15, 23, 42, 0.04)' }
              }
            }}
          >
            <ListItemText
              sx={{
                my: 0,
                mr: 1,
                '& .MuiTypography-root': {
                  whiteSpace: 'normal',
                  overflowWrap: 'anywhere',
                  lineHeight: 1.3
                }
              }}
              primary={
                <Typography
                  sx={{
                    color: isSelected ? '#111827' : 'rgba(55, 65, 81, 0.78)',
                    fontSize: '0.875rem',
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
