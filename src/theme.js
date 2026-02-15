import { createTheme } from '@mui/material/styles';

/**
 * Material Design 3 Theme for Firefox Performance Tuner
 * Android-style dark theme with proper contrast
 */
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#4a9eff',
      light: '#7bb8ff',
      dark: '#1976d2',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#9f86ff',
      light: '#cbbeff',
      dark: '#6442d6',
      contrastText: '#ffffff',
    },
    background: {
      default: '#1a1a1a',
      paper: '#232323',
    },
    text: {
      primary: '#e0e0e0',
      secondary: '#b0b0b0',
    },
    error: {
      main: '#ef4444',
      light: '#f87171',
      dark: '#dc2626',
    },
    warning: {
      main: '#f59e0b',
      light: '#fbbf24',
      dark: '#d97706',
    },
    success: {
      main: '#10b981',
      light: '#34d399',
      dark: '#059669',
    },
    info: {
      main: '#3b82f6',
      light: '#60a5fa',
      dark: '#2563eb',
    },
  },
  typography: {
    fontFamily: '"Google Sans Text", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 500,
      color: '#e0e0e0',
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 500,
      color: '#e0e0e0',
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 500,
      color: '#e0e0e0',
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 500,
      color: '#e0e0e0',
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 500,
      color: '#e0e0e0',
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 500,
      color: '#e0e0e0',
    },
    body1: {
      fontSize: '1rem',
      color: '#e0e0e0',
    },
    body2: {
      fontSize: '0.875rem',
      color: '#b0b0b0',
    },
    button: {
      textTransform: 'none',
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          userSelect: 'text',
          WebkitUserSelect: 'text',
          MozUserSelect: 'text',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          userSelect: 'text',
          WebkitUserSelect: 'text',
          MozUserSelect: 'text',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          userSelect: 'text',
          WebkitUserSelect: 'text',
          MozUserSelect: 'text',
          color: '#e0e0e0',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          userSelect: 'text',
          WebkitUserSelect: 'text',
          MozUserSelect: 'text',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          userSelect: 'text',
          WebkitUserSelect: 'text',
          MozUserSelect: 'text',
          backgroundColor: '#232323',
        },
      },
    },
  },
});

