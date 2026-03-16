import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import PropTypes from 'prop-types';
import CopyOutlined from '@ant-design/icons/CopyOutlined';
import ScissorOutlined from '@ant-design/icons/ScissorOutlined';
import SnippetsOutlined from '@ant-design/icons/SnippetsOutlined';

import { useWorkspace } from 'contexts/WorkspaceContext';
import { useGetMenuMaster } from 'api/menu';
import { DRAWER_WIDTH, MINI_DRAWER_WIDTH } from 'config';

export default function MiddleToolbar({ rightOffset }) {
  const { copyRequirement, cutRequirement, pasteBelowRequirement, hasRequirementClipboard, selectedRequirement } = useWorkspace();
  const { menuMaster } = useGetMenuMaster();
  const drawerOpen = menuMaster.isDashboardDrawerOpened;

  const actionButtonSx = {
    minWidth: 0,
    px: 0.45,
    py: 0.15,
    borderRadius: 1,
    color: 'text.secondary',
    fontSize: '0.7rem',
    fontWeight: 400,
    textTransform: 'none',
    height: 24,
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'center',
    '& .MuiButton-startIcon': {
      mr: 0.28,
      display: 'inline-flex',
      alignItems: 'center',
      '& svg': {
        fontSize: '0.72rem'
      }
    },
    '&:hover': {
      bgcolor: 'rgba(15, 23, 42, 0.04)',
      color: 'text.primary'
    },
    '&.Mui-disabled': {
      color: 'rgba(148, 163, 184, 0.8)',
      cursor: 'default',
      pointerEvents: 'none'
    }
  };

  return (
    <Box
      sx={{
        height: 42,
        minHeight: 42,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderBottomColor: 'divider',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        pt: 1.3,
        pl: 'calc(1.25rem + 4px)',
        pr: 1.25,
        position: 'fixed',
        top: 42,
        left: drawerOpen ? DRAWER_WIDTH : MINI_DRAWER_WIDTH,
        right: `${rightOffset}px`,
        zIndex: 1100
      }}
    >
      <Box component="span" sx={{ mr: 1.25 }}>
        <Button
          variant="text"
          color="inherit"
          startIcon={<CopyOutlined style={{ fontSize: '0.72rem' }} />}
          onClick={copyRequirement}
          disabled={!selectedRequirement}
          sx={actionButtonSx}
        >
          Copy
        </Button>
      </Box>
      <Box component="span" sx={{ mr: 1.25 }}>
        <Button
          variant="text"
          color="inherit"
          startIcon={<SnippetsOutlined style={{ fontSize: '0.72rem' }} />}
          onClick={pasteBelowRequirement}
          disabled={!selectedRequirement || !hasRequirementClipboard}
          sx={actionButtonSx}
        >
          Paste
        </Button>
      </Box>
      <span>
        <Button
          variant="text"
          color="inherit"
          startIcon={<ScissorOutlined style={{ fontSize: '0.72rem' }} />}
          onClick={cutRequirement}
          disabled={!selectedRequirement}
          sx={actionButtonSx}
        >
          Cut
        </Button>
      </span>
    </Box>
  );
}

MiddleToolbar.propTypes = {
  rightOffset: PropTypes.number
};
