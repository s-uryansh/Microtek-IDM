import { Button } from "./Button.jsx";
import { Icon } from "./Icon.jsx";

export function ErrorState({ title = "Something went wrong", message = "", onRetry }) {
  return (
    <div className="error-state" role="alert">
      <div className="error-state__icon" aria-hidden="true">
        <Icon name="warning" size={40} />
      </div>
      <h3 className="error-state__title">{title}</h3>
      {message && <p className="error-state__message">{message}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
