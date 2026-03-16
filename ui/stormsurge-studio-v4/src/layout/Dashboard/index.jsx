import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';

import useMediaQuery from '@mui/material/useMediaQuery';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';

// project imports
import Drawer from './Drawer';
import BlankRightPanel from './BlankRightPanel';
import Header from './Header';
import Footer from './Footer';
import Loader from 'components/Loader';
import Breadcrumbs from 'components/@extended/Breadcrumbs';

import { handlerDrawerOpen, useGetMenuMaster } from 'api/menu';

// ==============================|| MAIN LAYOUT ||============================== //

export default function DashboardLayout() {
  const { menuMasterLoading } = useGetMenuMaster();
  const downXL = useMediaQuery((theme) => theme.breakpoints.down('xl'));

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
        <Toolbar sx={{ mt: 'inherit' }} />
        <Box sx={{ display: 'flex', alignItems: 'stretch', minHeight: 'calc(100vh - 110px)' }}>
          <Box
            sx={{
              p: { xs: 2, sm: 3 },
              position: 'relative',
              minHeight: 'calc(100vh - 110px)',
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
          <BlankRightPanel />
        </Box>
      </Box>
    </Box>
  );
}
