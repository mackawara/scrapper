import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: {
      main: "#7B1FA2", // deep purple
      light: "#CE93D8", // light purple
      dark: "#4A148C", // dark purple
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#CE93D8", // light purple
      light: "#F3E5F5", // very light purple / lavender
      dark: "#7B1FA2",
      contrastText: "#FFFFFF",
    },
    background: {
      default: "#FFFFFF",
      paper: "#F3E5F5",
    },
  },
  typography: {
    fontFamily: "var(--font-geist-sans), Arial, sans-serif",
  },
});

export default theme;
