import { useContext } from "react";

import { ThemeContext } from "./ThemeProvider.jsx";

export function useTheme() {
  return useContext(ThemeContext);
}
