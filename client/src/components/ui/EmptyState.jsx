import { Icon } from "./Icon.jsx";

export function EmptyState({ icon = "document", title = "No data", description = "" }) {
  return (
    <div className="empty-state" role="status">
      <div className="empty-state__icon" aria-hidden="true">
        {typeof icon === "string" ? <Icon name={icon} size={40} /> : icon}
      </div>
      <h3 className="empty-state__title">{title}</h3>
      {description && <p className="empty-state__description">{description}</p>}
    </div>
  );
}
