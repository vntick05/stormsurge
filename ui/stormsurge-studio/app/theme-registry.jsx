"use client";

import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#238636",
      light: "#2ea043",
      dark: "#1a7f37",
    },
    secondary: {
      main: "#2f81f7",
      light: "#58a6ff",
      dark: "#1f6feb",
    },
    background: {
      default: "#010409",
      paper: "#0d1117",
    },
    text: {
      primary: "#e6edf3",
      secondary: "#7d8590",
    },
    divider: "#30363d",
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    h5: {
      fontWeight: 600,
      letterSpacing: -0.03,
    },
    h6: {
      fontWeight: 600,
      letterSpacing: -0.02,
    },
    subtitle1: {
      fontWeight: 500,
    },
    overline: {
      color: "#FFFFFF",
      fontSize: "0.72rem",
      letterSpacing: "0.14em",
    },
    body2: {
      lineHeight: 1.5,
      fontWeight: 400,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background:
            "radial-gradient(circle at top, rgba(31, 111, 235, 0.12), transparent 28%), linear-gradient(180deg, #0d1117 0%, #010409 100%)",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "#010409",
          borderBottom: "1px solid #21262d",
          boxShadow: "none",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "#0d1117",
          borderColor: "#30363d",
          boxShadow: "none",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          textTransform: "none",
          fontWeight: 500,
          boxShadow: "none",
        },
        containedPrimary: {
          color: "#ffffff",
          backgroundColor: "#238636",
          "&:hover": {
            boxShadow: "none",
            backgroundColor: "#2ea043",
          },
        },
        outlined: {
          color: "#e6edf3",
          borderColor: "#30363d",
          backgroundColor: "#161b22",
          "&:hover": {
            borderColor: "#8b949e",
            backgroundColor: "#1c2128",
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          backgroundColor: "#161b22",
          color: "#e6edf3",
          fontWeight: 600,
        },
        outlined: {
          borderColor: "#30363d",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "#0d1117",
          borderRadius: 8,
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "#30363d",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#8b949e",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#2f81f7",
            borderWidth: 1,
          },
        },
        input: {
          color: "#e6edf3",
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: "#7d8590",
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
          fontWeight: 500,
          minHeight: 46,
          color: "#7d8590",
          borderRadius: 6,
          marginRight: 4,
          "&.Mui-selected": {
            color: "#e6edf3",
            backgroundColor: "#161b22",
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
