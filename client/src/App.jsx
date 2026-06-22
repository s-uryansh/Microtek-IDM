import { RouterProvider } from "react-router-dom";

import { AuthProvider } from "./auth/AuthProvider.jsx";
import { ThemeProvider } from "./theme/ThemeProvider.jsx";
import { ToastProvider } from "./components/ui/ToastProvider.jsx";
import { router } from "./Router.jsx";

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
