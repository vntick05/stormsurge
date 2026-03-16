import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
// material-ui
import List from '@mui/material/List';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

// project import
import NavItem from './NavItem';
import { useGetMenuMaster } from 'api/menu';

// ==============================|| NAVIGATION - LIST GROUP ||============================== //

export default function NavGroup({ item }) {
  const { menuMaster } = useGetMenuMaster();
  const drawerOpen = menuMaster.isDashboardDrawerOpened;
  const [orderedItems, setOrderedItems] = useState(item.children ?? []);
  const [draggedItemId, setDraggedItemId] = useState(null);
  const [dragOverItemId, setDragOverItemId] = useState(null);

  useEffect(() => {
    setOrderedItems(item.children ?? []);
  }, [item]);

  const moveItem = (draggedId, targetId) => {
    if (!draggedId || draggedId === targetId) return;

    setOrderedItems((currentItems) => {
      const draggedIndex = currentItems.findIndex((menuItem) => menuItem.id === draggedId);
      const targetIndex = currentItems.findIndex((menuItem) => menuItem.id === targetId);

      if (draggedIndex === -1 || targetIndex === -1) return currentItems;

      const nextItems = [...currentItems];
      const [draggedItem] = nextItems.splice(draggedIndex, 1);
      nextItems.splice(targetIndex, 0, draggedItem);
      return nextItems;
    });
  };

  const navCollapse = orderedItems?.map((menuItem) => {
    switch (menuItem.type) {
      case 'collapse':
        return (
          <Typography key={menuItem.id} variant="caption" color="error" sx={{ p: 2.5 }}>
            collapse - only available in paid version
          </Typography>
        );
      case 'item':
        return (
          <NavItem
            key={menuItem.id}
            item={menuItem}
            level={1}
            isDragging={draggedItemId === menuItem.id}
            isDragTarget={dragOverItemId === menuItem.id && draggedItemId !== menuItem.id}
            dragProps={{
              draggable: true,
              onDragStart: () => setDraggedItemId(menuItem.id),
              onDragEnter: (event) => {
                event.preventDefault();
                setDragOverItemId(menuItem.id);
                moveItem(draggedItemId, menuItem.id);
              },
              onDragOver: (event) => {
                event.preventDefault();
              },
              onDrop: () => {
                moveItem(draggedItemId, menuItem.id);
                setDragOverItemId(null);
                setDraggedItemId(null);
              },
              onDragEnd: () => {
                setDragOverItemId(null);
                setDraggedItemId(null);
              }
            }}
          />
        );
      default:
        return (
          <Typography key={menuItem.id} variant="h6" color="error" align="center">
            Fix - Group Collapse or Items
          </Typography>
        );
    }
  });

  return (
    <List
      subheader={
        item.title &&
        drawerOpen && (
          <Box sx={{ pl: 3, mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ color: 'rgba(245, 247, 250, 0.72)' }}>
              {item.title}
            </Typography>
            {/* only available in paid version */}
          </Box>
        )
      }
      sx={{ mb: drawerOpen ? 1.5 : 0, py: 0, zIndex: 0 }}
    >
      {navCollapse}
    </List>
  );
}

NavGroup.propTypes = { item: PropTypes.object };
