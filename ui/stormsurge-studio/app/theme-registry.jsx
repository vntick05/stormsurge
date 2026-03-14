"use client";

import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#74A3FF",
      light: "#9BC0FF",
      dark: "#4F7EE0",
    },
    secondary: {
      main: "#8D95A7",
      light: "#B1B8C6",
      dark: "#646B7B",
    },
    background: {
      default: "#0B0D12",
      paper: "#151922",
    },
    text: {
      primary: "#F5EFE6",
      secondary: "#9D9AA2",
    },
    divider: "rgba(108, 104, 112, 0.22)",
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
      color: "#8A8490",
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
          background:
            "radial-gradient(circle at top left, rgba(116,163,255,0.06), transparent 26%), radial-gradient(circle at 85% 12%, rgba(79,126,224,0.05), transparent 18%), linear-gradient(180deg, #090b10 0%, #0c0f14 100%)",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "rgba(9, 11, 15, 0.88)",
          backdropFilter: "blur(14px)",
          boxShadow: "0 18px 38px rgba(0, 0, 0, 0.34)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          borderColor: "rgba(112, 106, 113, 0.09)",
          boxShadow: "0 14px 28px rgba(0, 0, 0, 0.16)",
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
          color: "#08111F",
          backgroundColor: "#74A3FF",
          "&:hover": {
            boxShadow: "none",
            backgroundColor: "#9BC0FF",
          },
        },
        outlined: {
          borderColor: "rgba(130, 119, 110, 0.12)",
          backgroundColor: "rgba(28, 31, 38, 0.78)",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          backgroundColor: "#1A1D24",
          color: "#B7B1AA",
          fontWeight: 600,
        },
        outlined: {
          borderColor: "rgba(130, 119, 110, 0.22)",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "#171A21",
          borderRadius: 3,
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(130, 119, 110, 0.1)",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(170, 152, 137, 0.18)",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#74A3FF",
            borderWidth: 1,
          },
        },
        input: {
          color: "#F5EFE6",
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: "#8D8891",
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
          color: "#8D8891",
          borderRadius: 3,
          marginRight: 4,
          "&.Mui-selected": {
            color: "#F5EFE6",
            backgroundColor: "rgba(116, 163, 255, 0.14)",
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
