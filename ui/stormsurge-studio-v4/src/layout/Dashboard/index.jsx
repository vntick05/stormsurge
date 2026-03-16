import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';

import useMediaQuery from '@mui/material/useMediaQuery';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';

// project imports
import Drawer from './Drawer';
import BlankRightPanel from './BlankRightPanel';
import Header from './Header';
import Footer from './Footer';
import MiddleToolbar from './MiddleToolbar';
import Loader from 'components/Loader';
import Breadcrumbs from 'components/@extended/Breadcrumbs';

import { handlerDrawerOpen, useGetMenuMaster } from 'api/menu';
import { RIGHT_PANEL_DEFAULT_WIDTH } from 'config';

// ==============================|| MAIN LAYOUT ||============================== //

export default function DashboardLayout() {
  const { menuMasterLoading } = useGetMenuMaster();
  const downXL = useMediaQuery((theme) => theme.breakpoints.down('xl'));
  const [rightPanelWidth, setRightPanelWidth] = useState(RIGHT_PANEL_DEFAULT_WIDTH);

  // set media wise responsive drawer
  useEffect(() => {
    handlerDrawerOpen(!downXL);
  }, [downXL]);

  if (menuMasterLoading) return <Loader />;

  return (
    <Box sx={{ display: 'flex', width: '100%' }}>
      <Header />
      <Drawer />

      <Box component="main" sx={{ width: 'calc(100% - 260px)', flexGrow: 1 }}>
        <Toolbar
          sx={{
            mt: 'inherit',
            minHeight: { xs: 38, sm: 38 },
            '&.MuiToolbar-root': {
              minHeight: { xs: 38, sm: 38 }
            }
          }}
        />
        <Box sx={{ display: 'flex', alignItems: 'stretch', minHeight: 'calc(100vh - 80px)' }}>
          <Box
            sx={{
              minHeight: 'calc(100vh - 80px)',
              display: 'flex',
              flexDirection: 'column',
              flexGrow: 1,
              minWidth: 0
            }}
          >
            <MiddleToolbar rightOffset={rightPanelWidth} />
            <Box
              sx={{
                px: { xs: 2, sm: 3 },
                pt: { xs: 'calc(0.5rem + 42px)', sm: 'calc(0.75rem + 42px)' },
                pb: { xs: 2, sm: 3 },
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                flexGrow: 1,
                minWidth: 0
              }}
            >
              <Breadcrumbs />
              <Outlet />
              <Footer />
            </Box>
          </Box>
          <BlankRightPanel onWidthChange={setRightPanelWidth} />
        </Box>
      </Box>
    </Box>
  );
}
