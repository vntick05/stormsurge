"use client";

import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#A9B5CB",
      light: "#D0DCF3",
      dark: "#747F8B",
    },
    secondary: {
      main: "#919BAC",
      light: "#D0DCF3",
      dark: "#5F6673",
    },
    background: {
      default: "#1E1D1F",
      paper: "#2A292C",
    },
    text: {
      primary: "#FFFFFF",
      secondary: "#FFFFFF",
    },
    divider: "rgba(255, 255, 255, 0.08)",
  },
  shape: {
    borderRadius: 3,
  },
  typography: {
    fontFamily: '"Sora", "IBM Plex Sans", "Trebuchet MS", sans-serif',
    h5: {
      fontWeight: 700,
      letterSpacing: -0.03,
    },
    h6: {
      fontWeight: 700,
      letterSpacing: -0.02,
    },
    subtitle1: {
      fontWeight: 600,
    },
    overline: {
      color: "#FFFFFF",
      fontSize: "0.72rem",
      letterSpacing: "0.14em",
    },
    body2: {
      lineHeight: 1.5,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: "linear-gradient(180deg, #1e1d1f 0%, #151518 100%)",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "rgba(36, 35, 38, 0.88)",
          backdropFilter: "blur(14px)",
          boxShadow: "none",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          borderColor: "rgba(255, 255, 255, 0.06)",
          boxShadow: "none",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 3,
          textTransform: "none",
          fontWeight: 600,
          boxShadow: "none",
        },
        containedPrimary: {
          color: "#080A0C",
          backgroundColor: "#D0DCF3",
          "&:hover": {
            boxShadow: "none",
            backgroundColor: "#A9B5CB",
          },
        },
        outlined: {
          borderColor: "rgba(255, 255, 255, 0.08)",
          backgroundColor: "rgba(255, 255, 255, 0.04)",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          backgroundColor: "rgba(255, 255, 255, 0.05)",
          color: "#ECECEC",
          fontWeight: 600,
        },
        outlined: {
          borderColor: "rgba(255, 255, 255, 0.08)",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "rgba(42, 41, 44, 0.88)",
          borderRadius: 3,
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255, 255, 255, 0.08)",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255, 255, 255, 0.12)",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#A9B5CB",
            borderWidth: 1,
          },
        },
        input: {
          color: "#ECECEC",
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: "#FFFFFF",
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
          color: "#FFFFFF",
          borderRadius: 3,
          marginRight: 4,
          "&.Mui-selected": {
            color: "#FFFFFF",
            backgroundColor: "rgba(255, 255, 255, 0.08)",
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
