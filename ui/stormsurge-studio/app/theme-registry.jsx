"use client";

import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#6EA8FE",
      light: "#8BB9FF",
      dark: "#4E86DD",
    },
    secondary: {
      main: "#98A2B3",
      light: "#BAC3D1",
      dark: "#6B7280",
    },
    background: {
      default: "#0A0F1A",
      paper: "#12161C",
    },
    text: {
      primary: "#F3F6FC",
      secondary: "#A9B4C8",
    },
    divider: "#24324A",
  },
  shape: {
    borderRadius: 6,
  },
  typography: {
    fontFamily: '"IBM Plex Sans", "Bahnschrift", "Trebuchet MS", sans-serif',
    h5: {
      fontWeight: 700,
      letterSpacing: -0.02,
    },
    h6: {
      fontWeight: 700,
      letterSpacing: -0.01,
    },
    subtitle1: {
      fontWeight: 600,
    },
    overline: {
      color: "#7D8AA3",
      fontSize: "0.72rem",
      letterSpacing: "0.08em",
    },
    body2: {
      lineHeight: 1.5,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: "linear-gradient(180deg, #0a0f1a 0%, #0d121b 100%)",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          boxShadow: "0 16px 40px rgba(2, 6, 14, 0.52)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          borderColor: "#24324A",
          boxShadow: "0 14px 34px rgba(2, 8, 20, 0.28)",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          textTransform: "none",
          fontWeight: 600,
          boxShadow: "none",
        },
        containedPrimary: {
          color: "#08101c",
          backgroundColor: "#6EA8FE",
          "&:hover": {
            boxShadow: "none",
            backgroundColor: "#8BB9FF",
          },
        },
        outlined: {
          borderColor: "#343B46",
          backgroundColor: "rgba(24, 28, 34, 0.92)",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          backgroundColor: "#1A1F27",
          color: "#A9B4C8",
          fontWeight: 600,
        },
        outlined: {
          borderColor: "#343B46",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "#1A1F27",
          borderRadius: 6,
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "#343B46",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#46505F",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#6EA8FE",
            borderWidth: 1,
          },
        },
        input: {
          color: "#F3F6FC",
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: "#7D8AA3",
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 4,
          borderRadius: 999,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          minHeight: 46,
          color: "#7D8AA3",
          borderRadius: 6,
          marginRight: 4,
          "&.Mui-selected": {
            color: "#F3F6FC",
            backgroundColor: "rgba(110, 168, 254, 0.18)",
          },
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
