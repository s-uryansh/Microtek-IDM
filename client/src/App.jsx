import { RouterProvider } from "react-router-dom";

import { AuthProvider } from "./auth/AuthProvider.jsx";
import { router } from "./Router.jsx";

export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
