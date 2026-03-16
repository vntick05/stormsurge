import { useRef } from 'react';

// material-ui
import Button from '@mui/material/Button';
import useMediaQuery from '@mui/material/useMediaQuery';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

import UploadOutlined from '@ant-design/icons/UploadOutlined';

import { useWorkspace } from 'contexts/WorkspaceContext';

// ==============================|| HEADER - CONTENT ||============================== //

export default function HeaderContent() {
  const downLG = useMediaQuery((theme) => theme.breakpoints.down('lg'));
  const inputRef = useRef(null);
  const { importOutline, isImporting, sections } = useWorkspace();

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await importOutline(file);
    event.target.value = '';
  };

  return (
    <>
      <Box sx={{ width: '100%', ml: downLG ? 1 : 0 }} />
      {!downLG ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isImporting ? <CircularProgress size={18} /> : null}
          <input hidden ref={inputRef} type="file" accept=".pdf,.doc,.docx" onChange={handleFileChange} />
          <Button
            variant="text"
            color="inherit"
            startIcon={<UploadOutlined />}
            onClick={() => inputRef.current?.click()}
            disabled={isImporting}
            sx={{
              minWidth: 0,
              px: 1,
              py: 0.5,
              borderRadius: 0,
              color: 'text.secondary',
              fontSize: '0.875rem',
              fontWeight: 500,
              textTransform: 'none',
              '& .MuiButton-startIcon': {
                mr: 0.5,
                '& svg': {
                  fontSize: '0.95rem'
                }
              },
              '&:hover': {
                bgcolor: 'transparent',
                color: 'text.primary'
              }
            }}
          >
            Start
          </Button>
        </Box>
      ) : null}
    </>
  );
}
