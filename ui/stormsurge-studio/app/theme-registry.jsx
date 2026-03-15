"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";

const STORAGE_KEY = "stormsurge-theme-mode";
const ThemeModeContext = createContext({
  mode: "dark",
  toggleMode: () => {},
});

function getDesignTokens(mode) {
  if (mode === "light") {
    return {
      palette: {
        mode,
        primary: {
          main: "#64d3e3",
          light: "#86deea",
          dark: "#3db8ca",
        },
        secondary: {
          main: "#f07f73",
          light: "#f5988d",
          dark: "#d8655a",
        },
        background: {
          default: "#edf1f5",
          paper: "#f4f6f8",
        },
        text: {
          primary: "#46515f",
          secondary: "#8b96a5",
        },
        divider: "#d9e0e7",
      },
      studioVars: {
        "--studio-base": "#2f3945",
        "--studio-surface": "#eef2f5",
        "--studio-panel": "#ffffff",
        "--studio-panel-hover": "#f6f8fa",
        "--studio-panel-selected": "#d9ecff",
        "--studio-border": "#d7dee6",
        "--studio-border-muted": "#414d5a",
        "--studio-text": "#566172",
        "--studio-text-muted": "#96a0ad",
        "--studio-title": "#ffffff",
        "--studio-ai-action": "#64d3e3",
        "--studio-topbar-accent": "#7fdcea",
        "--studio-topbar-accent-hover": "#a0e7f0",
        "--studio-hover-soft": "rgba(100, 211, 227, 0.08)",
        "--studio-hover-strong": "rgba(100, 211, 227, 0.18)",
        "--studio-selection-soft": "rgba(100, 211, 227, 0.14)",
        "--studio-scrollbar": "#c6d0da",
        "--studio-appbar-bg": "#2f3945",
        "--studio-appbar-border": "rgba(255, 255, 255, 0.08)",
        "--studio-card-shadow": "0 12px 24px rgba(33, 47, 61, 0.08)",
        "--studio-chrome-bg": "#2f3945",
        "--studio-chrome-bg-soft": "#374351",
        "--studio-chrome-text": "#eef2f5",
        "--studio-chrome-muted": "#a4b0be",
        "--studio-chrome-border": "#414d5a",
        "--studio-accent-coral": "#f07f73",
        "--studio-body-bg":
          "linear-gradient(180deg, #edf1f5 0%, #e7edf3 100%)",
      },
    };
  }

  return {
    palette: {
      mode,
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
    studioVars: {
      "--studio-base": "#010409",
      "--studio-surface": "#0d1117",
      "--studio-panel": "#161b22",
      "--studio-panel-hover": "#1c2128",
      "--studio-panel-selected": "#1f2937",
      "--studio-border": "#30363d",
      "--studio-border-muted": "#21262d",
      "--studio-text": "#e6edf3",
      "--studio-text-muted": "#7d8590",
      "--studio-title": "#ffffff",
      "--studio-ai-action": "#c678dd",
      "--studio-topbar-accent": "#58a6ff",
      "--studio-topbar-accent-hover": "#79c0ff",
      "--studio-hover-soft": "rgba(255, 255, 255, 0.06)",
      "--studio-hover-strong": "rgba(255, 255, 255, 0.12)",
      "--studio-selection-soft": "rgba(255, 255, 255, 0.08)",
      "--studio-scrollbar": "#30363d",
      "--studio-appbar-bg": "#000000",
      "--studio-appbar-border": "rgba(255, 255, 255, 0.22)",
      "--studio-card-shadow": "0 18px 28px rgba(0, 0, 0, 0.22)",
      "--studio-chrome-bg": "#010409",
      "--studio-chrome-bg-soft": "#161b22",
      "--studio-chrome-text": "#e6edf3",
      "--studio-chrome-muted": "#7d8590",
      "--studio-chrome-border": "#21262d",
      "--studio-accent-coral": "#f78166",
      "--studio-body-bg":
        "radial-gradient(circle at top, rgba(31, 111, 235, 0.12), transparent 28%), linear-gradient(180deg, #0d1117 0%, #010409 100%)",
    },
  };
}

function buildTheme(mode) {
  const tokens = getDesignTokens(mode);
  return createTheme({
    palette: tokens.palette,
    shape: {
      borderRadius: 8,
    },
    typography: {
      fontFamily: '"Libre Franklin", "Segoe UI", Helvetica, Arial, sans-serif',
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
        color: "var(--studio-title)",
        fontSize: "0.72rem",
        letterSpacing: "0.14em",
      },
      body1: {
        fontFamily: '"Libre Franklin", "Segoe UI", Helvetica, Arial, sans-serif',
      },
      body2: {
        fontFamily: '"Libre Franklin", "Segoe UI", Helvetica, Arial, sans-serif',
        lineHeight: 1.5,
        fontWeight: 400,
      },
      button: {
        fontFamily: '"Libre Franklin", "Segoe UI", Helvetica, Arial, sans-serif',
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ":root": tokens.studioVars,
          body: {
            background: "var(--studio-body-bg)",
            color: "var(--studio-text)",
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            backgroundColor: "var(--studio-appbar-bg)",
            borderBottom: "1px solid var(--studio-appbar-border)",
            boxShadow: "none",
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            backgroundColor: "var(--studio-surface)",
            borderColor: "var(--studio-border)",
            boxShadow: "none",
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
            color: "#ffffff",
            backgroundColor: tokens.palette.primary.main,
            "&:hover": {
              boxShadow: "none",
              backgroundColor: tokens.palette.primary.light,
            },
          },
          outlined: {
            color: "var(--studio-text)",
            borderColor: "var(--studio-border)",
            backgroundColor: "var(--studio-panel)",
            "&:hover": {
              borderColor: "var(--studio-text-muted)",
              backgroundColor: "var(--studio-panel-hover)",
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            backgroundColor: "var(--studio-panel)",
            color: "var(--studio-text)",
            fontWeight: 600,
          },
          outlined: {
            borderColor: "var(--studio-border)",
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: "var(--studio-surface)",
            borderRadius: 8,
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: "var(--studio-border)",
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: "var(--studio-text-muted)",
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: tokens.palette.primary.main,
              borderWidth: 1,
            },
          },
          input: {
            color: "var(--studio-text)",
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            color: "var(--studio-text-muted)",
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
            color: "var(--studio-text-muted)",
            borderRadius: 6,
            marginRight: 4,
            "&.Mui-selected": {
              color: "var(--studio-text)",
              backgroundColor: "var(--studio-panel)",
            },
          },
        },
      },
    },
  });
}

export function ThemeRegistry({ children }) {
  const [mode, setMode] = useState("dark");

  useEffect(() => {
    try {
      const savedMode = window.localStorage.getItem(STORAGE_KEY);
      if (savedMode === "light" || savedMode === "dark") {
        setMode(savedMode);
      }
    } catch {}
  }, []);

  const theme = useMemo(() => buildTheme(mode), [mode]);
  const value = useMemo(
    () => ({
      mode,
      toggleMode: () => {
        setMode((current) => {
          const nextMode = current === "dark" ? "light" : "dark";
          try {
            window.localStorage.setItem(STORAGE_KEY, nextMode);
          } catch {}
          return nextMode;
        });
      },
    }),
    [mode],
  );

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useStudioThemeMode() {
  return useContext(ThemeModeContext);
}
