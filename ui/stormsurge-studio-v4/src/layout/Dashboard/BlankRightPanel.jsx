import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

import Box from '@mui/material/Box';
import IconButton from 'components/@extended/IconButton';

import MenuFoldOutlined from '@ant-design/icons/MenuFoldOutlined';
import MenuUnfoldOutlined from '@ant-design/icons/MenuUnfoldOutlined';

import { RIGHT_PANEL_DEFAULT_WIDTH, RIGHT_PANEL_MAX_WIDTH, RIGHT_PANEL_MIN_WIDTH } from 'config';

export default function BlankRightPanel({ onWidthChange }) {
  const [width, setWidth] = useState(RIGHT_PANEL_DEFAULT_WIDTH);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const previousExpandedWidth = useRef(RIGHT_PANEL_DEFAULT_WIDTH);

  useEffect(() => {
    onWidthChange?.(width);
  }, [onWidthChange, width]);

  useEffect(() => {
    if (!isResizing) return undefined;

    const handlePointerMove = (event) => {
      const nextWidth = window.innerWidth - event.clientX;
      const clampedWidth = Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, nextWidth));

      setWidth(clampedWidth);
      if (clampedWidth > RIGHT_PANEL_MIN_WIDTH) {
        previousExpandedWidth.current = clampedWidth;
        if (isCollapsed) setIsCollapsed(false);
      }
    };

    const handlePointerUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isCollapsed, isResizing]);

  const toggleCollapsed = () => {
    if (isCollapsed) {
      setWidth(previousExpandedWidth.current);
      setIsCollapsed(false);
      return;
    }

    previousExpandedWidth.current = width;
    setWidth(RIGHT_PANEL_MIN_WIDTH);
    setIsCollapsed(true);
  };

  const startResize = (event) => {
    event.preventDefault();
    setIsResizing(true);
  };

  return (
    <Box
      sx={(theme) => ({
        position: 'sticky',
        top: 38,
        alignSelf: 'flex-start',
        flexShrink: 0,
        width,
        minWidth: width,
        bgcolor: '#edf1f5',
        borderLeft: '1px solid',
        borderColor: '#cbd5df',
        height: 'calc(100vh - 38px)',
        minHeight: 'calc(100vh - 38px)',
        transition: isResizing ? 'none' : theme.transitions.create('width', {
          easing: theme.transitions.easing.sharp,
          duration: theme.transitions.duration.shorter
        }),
        overflow: 'hidden'
      })}
    >
      <Box
        onPointerDown={startResize}
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 10,
          cursor: 'col-resize',
          zIndex: 2
        }}
      />

      <Box
        sx={{
          display: 'flex',
          justifyContent: isCollapsed ? 'center' : 'flex-end',
          alignItems: 'center',
          minHeight: 42,
          px: 0.5,
          position: 'relative',
          zIndex: 2
        }}
      >
        <IconButton
          aria-label={isCollapsed ? 'expand right panel' : 'collapse right panel'}
          onClick={toggleCollapsed}
          color="secondary"
          variant="light"
          size="small"
          sx={{ mr: isCollapsed ? 0 : 0.5 }}
        >
          {isCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        </IconButton>
      </Box>
    </Box>
  );
}

BlankRightPanel.propTypes = {
  onWidthChange: PropTypes.func
};
