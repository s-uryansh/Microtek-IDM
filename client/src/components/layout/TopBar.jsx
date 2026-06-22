import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../ui/Icon.jsx";
import { useTheme } from "../../theme/useTheme.js";

export function TopBar({ onMenuToggle, notificationCount = 0 }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const hasNotifications = notificationCount > 0;
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  function handleSearchKeyDown(e) {
    if (e.key !== "Enter") return;
    const value = query.trim();
    if (!value) return;
    const looksLikeInvoice = /^\d+$/.test(value) || /inv/i.test(value);
    navigate(looksLikeInvoice
      ? `/fulfilment?q=${encodeURIComponent(value)}`
      : `/serials?q=${encodeURIComponent(value)}`
    );
  }

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
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
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
          {hasNotifications && <span className="top-bar__action-badge" />}
        </button>
      </div>
    </header>
  );
}
