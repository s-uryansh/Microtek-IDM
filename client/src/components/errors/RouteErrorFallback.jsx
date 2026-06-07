import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router-dom";

import { ErrorState } from "../ui/ErrorState.jsx";
import { Button } from "../ui/Button.jsx";

function describeError(error) {
  if (isRouteErrorResponse(error)) {
    return {
      title: `${error.status} — ${error.statusText || "Error"}`,
      message: typeof error.data === "string" ? error.data : error.data?.message || "The requested page could not be loaded."
    };
  }
  const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV === true;
  return {
    title: "Unexpected application error",
    message: isDev && error?.message ? error.message : "An unexpected error occurred. Please retry."
  };
}

export function RouteErrorFallback() {
  const error = useRouteError();
  const navigate = useNavigate();
  const { title, message } = describeError(error);

  function handleRetry() {
    navigate(0);
  }

  function handleHome() {
    navigate("/dashboard");
  }

  return (
    <div style={{ padding: "var(--space-6)" }} role="alert">
      <ErrorState title={title} message={message} onRetry={handleRetry} />
      <div style={{ display: "flex", justifyContent: "center", marginTop: "var(--space-4)" }}>
        <Button variant="secondary" onClick={handleHome}>
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}
