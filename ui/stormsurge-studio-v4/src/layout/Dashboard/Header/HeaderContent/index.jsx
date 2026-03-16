// material-ui
import useMediaQuery from '@mui/material/useMediaQuery';
import Box from '@mui/material/Box';

// ==============================|| HEADER - CONTENT ||============================== //

export default function HeaderContent() {
  const downLG = useMediaQuery((theme) => theme.breakpoints.down('lg'));

  return (
    <>
      <Box sx={{ width: '100%', ml: downLG ? 1 : 0 }} />
    </>
  );
}
