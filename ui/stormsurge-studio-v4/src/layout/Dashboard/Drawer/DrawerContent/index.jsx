import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

// project imports
import NavCard from './NavCard';
import Navigation from './Navigation';
import SimpleBar from 'components/third-party/SimpleBar';
import { useGetMenuMaster } from 'api/menu';

// ==============================|| DRAWER CONTENT ||============================== //

export default function DrawerContent() {
  const { menuMaster } = useGetMenuMaster();
  const drawerOpen = menuMaster.isDashboardDrawerOpened;

  return (
    <>
      <SimpleBar sx={{ '& .simplebar-content': { display: 'flex', flexDirection: 'column' } }}>
        {drawerOpen ? (
          <Navigation />
        ) : (
          <Box
            sx={{
              minHeight: 'calc(100vh - 60px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              px: 1
            }}
          >
            <Typography
              sx={{
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
                color: 'rgba(55, 65, 81, 0.72)',
                fontSize: '0.78rem',
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                userSelect: 'none'
              }}
            >
              Sections
            </Typography>
          </Box>
        )}
        {drawerOpen && <NavCard />}
      </SimpleBar>
    </>
  );
}
