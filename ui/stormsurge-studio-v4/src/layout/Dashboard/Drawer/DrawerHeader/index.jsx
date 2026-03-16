import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import RightOutlined from '@ant-design/icons/RightOutlined';
import LeftOutlined from '@ant-design/icons/LeftOutlined';

// project imports
import DrawerHeaderStyled from './DrawerHeaderStyled';
import IconButton from 'components/@extended/IconButton';
import { handlerDrawerOpen } from 'api/menu';

// ==============================|| DRAWER HEADER ||============================== //

export default function DrawerHeader({ open }) {
  return (
    <DrawerHeaderStyled
      open={open}
      sx={{
        minHeight: '60px',
        width: 'initial',
        paddingTop: '18px',
        paddingBottom: '8px',
        paddingLeft: open ? '24px' : 0,
        paddingRight: open ? '0px' : 0,
        backgroundColor: '#ffffff'
      }}
    >
      {open ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.9 }}>
          <Box
            sx={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: '2px solid #2563eb',
              position: 'relative',
              '&::before, &::after': {
                content: '""',
                position: 'absolute',
                inset: -2,
                border: '2px solid #2563eb',
                borderRadius: '50%'
              },
              '&::before': {
                transform: 'rotate(60deg)'
              },
              '&::after': {
                transform: 'rotate(-60deg)'
              }
            }}
          />
          <Typography
            sx={{
              color: '#374151',
              fontSize: '1.45rem',
              fontWeight: 400,
              letterSpacing: '-0.03em',
              lineHeight: 1
            }}
          >
            StormStudio
          </Typography>
        </Box>
      ) : (
        <span />
      )}
      <IconButton
        aria-label={open ? 'collapse drawer' : 'expand drawer'}
        onClick={() => handlerDrawerOpen(!open)}
        color="secondary"
        variant="light"
        size="small"
        sx={{
          ml: open ? -2 : 0,
          width: 24,
          height: 24,
          color: 'rgba(55, 65, 81, 0.55)',
          bgcolor: 'transparent',
          opacity: open ? 0.7 : 0.45,
          transform: 'translateY(-2px)',
          '&:hover': {
            bgcolor: 'rgba(15, 23, 42, 0.04)',
            color: '#374151',
            opacity: 1
          }
        }}
      >
        {open ? <LeftOutlined style={{ fontSize: '0.72rem' }} /> : <RightOutlined style={{ fontSize: '0.72rem' }} />}
      </IconButton>
    </DrawerHeaderStyled>
  );
}

DrawerHeader.propTypes = { open: PropTypes.bool };
