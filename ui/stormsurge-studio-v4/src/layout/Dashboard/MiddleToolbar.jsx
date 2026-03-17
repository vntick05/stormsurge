import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import PropTypes from 'prop-types';
import ApartmentOutlined from '@ant-design/icons/ApartmentOutlined';
import CopyOutlined from '@ant-design/icons/CopyOutlined';
import NodeIndexOutlined from '@ant-design/icons/NodeIndexOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import ScissorOutlined from '@ant-design/icons/ScissorOutlined';
import SnippetsOutlined from '@ant-design/icons/SnippetsOutlined';

import { useWorkspace } from 'contexts/WorkspaceContext';
import { useGetMenuMaster } from 'api/menu';
import { DRAWER_WIDTH, MINI_DRAWER_WIDTH } from 'config';

export default function MiddleToolbar({ rightOffset }) {
  const {
    addChildRequirement,
    addNewRequirement,
    copyRequirement,
    createSection,
    cutRequirement,
    pasteBelowRequirement,
    hasRequirementClipboard,
    selectedRequirement
  } = useWorkspace();
  const { menuMaster } = useGetMenuMaster();
  const drawerOpen = menuMaster.isDashboardDrawerOpened;

  const actionButtonSx = {
    minWidth: 0,
    px: 0.55,
    py: 0,
    borderRadius: 1,
    color: 'text.secondary',
    fontSize: '0.7rem',
    fontWeight: 400,
    textTransform: 'none',
    height: 22,
    minHeight: 22,
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'center',
    lineHeight: 1,
    '& .MuiButton-startIcon': {
      mr: 0.35,
      display: 'inline-flex',
      alignItems: 'center',
      '& svg': {
        fontSize: '0.76rem'
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
        height: 36,
        minHeight: 36,
        bgcolor: '#f3f6f9',
        borderTop: '1px solid',
        borderTopColor: '#cbd5df',
        borderBottom: '1px solid',
        borderBottomColor: '#cbd5df',
        flexShrink: 0,
        position: 'fixed',
        top: 38,
        left: drawerOpen ? DRAWER_WIDTH : MINI_DRAWER_WIDTH,
        right: `${rightOffset}px`,
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        overflow: 'hidden',
        
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1.1,
          height: 20,
          ml: 3,
          maxWidth: 'calc(100% - 32px)',
          overflow: 'hidden',
          transform: 'translateY(1px)',
          position: 'relative',
          zIndex: 2
        }}
      >
        <Box component="span">
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
        <Box component="span">
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
        <Box component="span">
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
        </Box>
        <Box
          sx={{
            width: '1px',
            height: 18,
            bgcolor: 'rgba(148, 163, 184, 0.32)'
          }}
        />
        <Box component="span">
          <Button
            variant="text"
            color="inherit"
            startIcon={<PlusOutlined style={{ fontSize: '0.72rem' }} />}
            onClick={addNewRequirement}
            sx={actionButtonSx}
          >
            New
          </Button>
        </Box>
        <Box component="span">
          <Button
            variant="text"
            color="inherit"
            startIcon={<NodeIndexOutlined style={{ fontSize: '0.72rem' }} />}
            onClick={addChildRequirement}
            disabled={!selectedRequirement}
            sx={actionButtonSx}
          >
            Child
          </Button>
        </Box>
        <Box component="span">
          <Button
            variant="text"
            color="inherit"
            startIcon={<ApartmentOutlined style={{ fontSize: '0.72rem' }} />}
            onClick={createSection}
            sx={actionButtonSx}
          >
            Section
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

MiddleToolbar.propTypes = {
  rightOffset: PropTypes.number
};
