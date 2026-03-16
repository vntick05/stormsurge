import PropTypes from 'prop-types';
import { Link, useLocation, matchPath } from 'react-router-dom';

// material-ui
import useMediaQuery from '@mui/material/useMediaQuery';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

// project imports
import IconButton from 'components/@extended/IconButton';

import { handlerDrawerOpen, useGetMenuMaster } from 'api/menu';
import HolderOutlined from '@ant-design/icons/HolderOutlined';

// ==============================|| NAVIGATION - LIST ITEM ||============================== //

export default function NavItem({ item, level, isParents = false, setSelectedID, dragProps, isDragging = false, isDragTarget = false }) {
  const { menuMaster } = useGetMenuMaster();
  const drawerOpen = menuMaster.isDashboardDrawerOpened;

  const downLG = useMediaQuery((theme) => theme.breakpoints.down('lg'));

  let itemTarget = '_self';
  if (item.target) {
    itemTarget = '_blank';
  }

  const itemHandler = () => {
    if (downLG) handlerDrawerOpen(false);

    if (isParents && setSelectedID) {
      setSelectedID(item.id);
    }
  };

  const Icon = item.icon;
  const itemIcon = item.icon ? (
    <Icon
      style={{
        fontSize: drawerOpen ? '1rem' : '1.25rem',
        ...(isParents && { fontSize: 20, stroke: '1.5' })
      }}
    />
  ) : (
    false
  );

  const { pathname } = useLocation();
  const isSelected = !!matchPath({ path: item?.link ? item.link : item.url, end: false }, pathname);

  const textColor = 'rgba(237, 242, 247, 0.72)';
  const selectedTextColor = '#ffffff';
  const iconSelectedColor = 'primary.main';

  return (
    <>
      <Box
        sx={{
          position: 'relative',
          opacity: isDragging ? 0.45 : 1,
          cursor: isDragging ? 'grabbing' : 'grab',
          transform: isDragging ? 'scale(0.98)' : 'scale(1)',
          transition: 'background-color 160ms ease, transform 160ms ease, opacity 160ms ease',
          bgcolor: isDragTarget ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
          outline: isDragTarget ? '1px dashed rgba(255, 255, 255, 0.24)' : 'none',
          outlineOffset: '-1px',
          borderRadius: 1.5
        }}
        {...dragProps}
      >
        <ListItemButton
          component={Link}
          to={item.url}
          target={itemTarget}
          disabled={item.disabled}
          selected={isSelected}
          sx={(theme) => ({
            zIndex: 1201,
            pl: drawerOpen ? `${level * 28}px` : 1.5,
            py: !drawerOpen && level === 1 ? 1.25 : 1,
            pr: drawerOpen ? 2 : 1.5,
            color: isSelected ? selectedTextColor : textColor,
            ...(drawerOpen && {
              '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.04)' },
              '&.Mui-selected': {
                bgcolor: 'transparent',
                borderRight: '3px solid',
                borderColor: 'primary.main',
                color: selectedTextColor,
                '&:hover': { color: selectedTextColor, bgcolor: 'rgba(255, 255, 255, 0.04)' }
              }
            }),
            ...(!drawerOpen && {
              '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.04)' },
              '&.Mui-selected': { '&:hover': { bgcolor: 'transparent' }, bgcolor: 'transparent' }
            })
          })}
          onClick={() => itemHandler()}
        >
          {drawerOpen && (
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isSelected ? 'rgba(255, 255, 255, 0.7)' : 'rgba(237, 242, 247, 0.34)',
                mr: 1.25,
                cursor: isDragging ? 'grabbing' : 'grab'
              }}
            >
              <HolderOutlined style={{ fontSize: '0.8rem' }} />
            </Box>
          )}
          {itemIcon && (
            <ListItemIcon
              sx={(theme) => ({
                minWidth: 28,
                color: isSelected ? iconSelectedColor : textColor,
                ...(!drawerOpen && {
                  borderRadius: 1.5,
                  width: 36,
                  height: 36,
                  alignItems: 'center',
                  justifyContent: 'center',
                  '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.08)' }
                }),
                ...(!drawerOpen &&
                  isSelected && {
                    bgcolor: 'transparent',
                    '&:hover': { bgcolor: 'transparent' }
                  })
              })}
            >
              {itemIcon}
            </ListItemIcon>
          )}
          {(drawerOpen || (!drawerOpen && level !== 1)) && (
            <ListItemText
              primary={
                <Typography
                  variant="h6"
                  sx={{
                    color: isSelected ? selectedTextColor : textColor,
                    fontSize: '0.875rem',
                    fontWeight: isSelected ? 700 : 500,
                    letterSpacing: '-0.01em'
                  }}
                >
                  {item.title}
                </Typography>
              }
            />
          )}
          {(drawerOpen || (!drawerOpen && level !== 1)) && item.chip && (
            <Chip
              color={item.chip.color}
              variant={item.chip.variant}
              size={item.chip.size}
              label={item.chip.label}
              avatar={item.chip.avatar && <Avatar>{item.chip.avatar}</Avatar>}
            />
          )}
        </ListItemButton>
        {(drawerOpen || (!drawerOpen && level !== 1)) &&
          item?.actions &&
          item?.actions.map((action, index) => {
            const ActionIcon = action.icon;
            const callAction = action?.function;
            return (
              <IconButton
                key={index}
                {...(action.type === 'function' && {
                  onClick: (event) => {
                    event.stopPropagation();
                    callAction();
                  }
                })}
                {...(action.type === 'link' && {
                  component: Link,
                  to: action.url,
                  target: action.target ? '_blank' : '_self'
                })}
                color="secondary"
                variant="outlined"
                sx={{
                  position: 'absolute',
                  top: 12,
                  right: 20,
                  zIndex: 1202,
                  width: 20,
                  height: 20,
                  mr: -1,
                  ml: 1,
                  color: 'secondary.dark',
                  borderColor: isSelected ? 'primary.light' : 'secondary.light',
                  '&:hover': { borderColor: isSelected ? 'primary.main' : 'secondary.main' }
                }}
              >
                <ActionIcon style={{ fontSize: '0.625rem' }} />
              </IconButton>
            );
          })}
      </Box>
    </>
  );
}

NavItem.propTypes = {
  dragProps: PropTypes.object,
  isDragging: PropTypes.bool,
  isDragTarget: PropTypes.bool,
  item: PropTypes.any,
  level: PropTypes.number,
  isParents: PropTypes.bool,
  setSelectedID: PropTypes.oneOfType([PropTypes.any, PropTypes.func])
};
