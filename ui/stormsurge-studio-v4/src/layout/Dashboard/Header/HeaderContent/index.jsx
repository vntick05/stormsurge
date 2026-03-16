import { useRef } from 'react';

// material-ui
import Button from '@mui/material/Button';
import useMediaQuery from '@mui/material/useMediaQuery';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

import RedoOutlined from '@ant-design/icons/RedoOutlined';
import SaveOutlined from '@ant-design/icons/SaveOutlined';
import UndoOutlined from '@ant-design/icons/UndoOutlined';
import UploadOutlined from '@ant-design/icons/UploadOutlined';

import { useWorkspace } from 'contexts/WorkspaceContext';

// ==============================|| HEADER - CONTENT ||============================== //

export default function HeaderContent() {
  const downLG = useMediaQuery((theme) => theme.breakpoints.down('lg'));
  const inputRef = useRef(null);
  const { importOutline, isImporting, sections, sourceFilename } = useWorkspace();

  const utilityButtonSx = {
    minWidth: 0,
    px: 0.45,
    py: 0,
    borderRadius: 0,
    color: 'rgba(55, 65, 81, 0.92)',
    fontSize: '0.74rem',
    fontWeight: 400,
    textTransform: 'none',
    height: 22,
    minHeight: 22,
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    '& .MuiButton-startIcon': {
      mr: 0.3,
      display: 'inline-flex',
      alignItems: 'center',
      '& svg': {
        fontSize: '0.85rem'
      }
    },
    '&:hover': {
      bgcolor: 'transparent',
      color: 'text.primary'
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await importOutline(file);
    event.target.value = '';
  };

  return (
    <>
      {!downLG ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            width: '100%',
            height: '100%',
            ml: downLG ? 1 : 0,
            position: 'relative'
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              minWidth: 0,
              height: 22,
              ml: 0.5,
              bgcolor: 'rgba(245, 158, 11, 0.14)',
              outline: '1px solid rgba(245, 158, 11, 0.3)'
            }}
          >
            <Button
              variant="text"
              color="inherit"
              startIcon={<SaveOutlined />}
              sx={{
                ...utilityButtonSx,
                color: 'rgba(55, 65, 81, 0.92)',
                '& .MuiButton-startIcon': {
                  mr: 0.3,
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: '#2f855a',
                  '& svg': {
                    fontSize: '0.85rem'
                  }
                },
                '&:hover': {
                  bgcolor: 'transparent',
                  color: 'text.primary',
                  '& .MuiButton-startIcon': {
                    color: '#276749'
                  }
                }
              }}
            >
              Save
            </Button>
            <Button variant="text" color="inherit" startIcon={<UndoOutlined />} sx={utilityButtonSx}>
              Undo
            </Button>
            <Button variant="text" color="inherit" startIcon={<RedoOutlined />} sx={utilityButtonSx}>
              Redo
            </Button>
            <Typography
              sx={{
                color: 'rgba(55, 65, 81, 0.92)',
                fontSize: '0.82rem',
                fontWeight: 400,
                lineHeight: 1,
                whiteSpace: 'nowrap',
                maxWidth: 240,
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {sourceFilename || 'No file loaded'}
            </Typography>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              height: 22,
              bgcolor: 'rgba(168, 85, 247, 0.12)',
              outline: '1px solid rgba(168, 85, 247, 0.25)'
            }}
          >
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
                py: 0,
                borderRadius: 0,
                color: 'text.secondary',
                fontSize: '0.875rem',
                fontWeight: 500,
                textTransform: 'none',
                height: 22,
                minHeight: 22,
                lineHeight: 1,
                display: 'inline-flex',
                alignItems: 'center',
                '& .MuiButton-startIcon': {
                  mr: 0.5,
                  display: 'inline-flex',
                  alignItems: 'center',
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
        </Box>
      ) : null}
    </>
  );
}
