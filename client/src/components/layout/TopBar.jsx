import { Icon } from "../ui/Icon.jsx";
import { useTheme } from "../../theme/useTheme.js";

export function TopBar({ onMenuToggle }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

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
        <button
          className="top-bar__action-btn"
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          title={isDark ? "Switch to light theme" : "Switch to dark theme"}
        >
          <Icon name={isDark ? "sun" : "moon"} size={18} />
        </button>
        <button className="top-bar__action-btn" type="button" aria-label="Notifications">
          <Icon name="bell" size={18} />
          <span className="top-bar__action-badge" />
        </button>
      </div>
    </header>
  );
}
