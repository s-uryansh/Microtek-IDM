import { RouterProvider } from "react-router-dom";

import { AuthProvider } from "./auth/AuthProvider.jsx";
import { ThemeProvider } from "./theme/ThemeProvider.jsx";
import { router } from "./Router.jsx";

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  );
}
