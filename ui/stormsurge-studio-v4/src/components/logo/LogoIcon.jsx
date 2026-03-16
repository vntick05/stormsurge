import Box from '@mui/material/Box';

import stormStudioLogo from 'assets/images/users/StormStudio.png';

export default function LogoIcon() {
  return (
    <Box
      component="img"
      src={stormStudioLogo}
      alt="StormStudio"
      sx={{
        width: 44,
        height: 44,
        display: 'block',
        objectFit: 'cover',
        objectPosition: 'left center',
        borderRadius: 1
      }}
    />
  );
}
