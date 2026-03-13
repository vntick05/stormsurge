"use client";

import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#6cb6ff",
      light: "#9fd0ff",
      dark: "#3f90da",
    },
    secondary: {
      main: "#8ad7c4",
      light: "#b4eadf",
      dark: "#58b7a0",
    },
    background: {
      default: "#0b1220",
      paper: "#111a2b",
    },
    divider: "rgba(148, 163, 184, 0.18)",
  },
  shape: {
    borderRadius: 4,
  },
  typography: {
    fontFamily: '"IBM Plex Sans", "Bahnschrift", "Trebuchet MS", sans-serif',
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background:
            "radial-gradient(circle at top right, rgba(108, 182, 255, 0.12), transparent 26%), linear-gradient(180deg, #0b1220 0%, #0f172a 100%)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
  },
});

export function ThemeRegistry({ children }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
