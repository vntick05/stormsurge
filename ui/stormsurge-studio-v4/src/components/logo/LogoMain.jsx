import Box from '@mui/material/Box';

import stormStudioLogo from 'assets/images/users/StormStudio.png';

export default function LogoMain() {
  return (
    <Box
      component="img"
      src={stormStudioLogo}
      alt="StormStudio"
      sx={{
        width: 220,
        height: 52,
        display: 'block',
        objectFit: 'contain',
        objectPosition: 'left center'
      }}
    />
  );
}
