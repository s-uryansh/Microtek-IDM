import { Icon } from "../ui/Icon.jsx";

export function TopBar({ onMenuToggle }) {
  return (
    <header className="top-bar">
      <button
        className="top-bar__menu-toggle"
        onClick={onMenuToggle}
        aria-label="Toggle navigation menu"
        type="button"
      >
        <Icon name="menu" size={18} />
      </button>

      <div className="top-bar__spacer" />

      <div className="top-bar__search">
        <Icon name="search" className="top-bar__search-icon" size={16} />
        <input
          className="top-bar__search-input"
          type="search"
          placeholder="Search serials, invoices..."
          aria-label="Search"
        />
      </div>

      <div className="top-bar__actions">
        <button className="top-bar__action-btn" type="button" aria-label="Notifications">
          <Icon name="bell" size={18} />
          <span className="top-bar__action-badge" />
        </button>
      </div>
    </header>
  );
}
