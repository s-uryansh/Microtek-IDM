import { NavLink } from "react-router-dom";
import { useAuth } from "../../auth/useAuth.js";
import { Icon } from "../ui/Icon.jsx";

const navSections = [
  {
    title: "Operations",
    items: [
      { label: "GRN", path: "/grn", icon: "box" },
      { label: "Dispatch", path: "/dispatch", icon: "truck" },
      { label: "SRN", path: "/srn", icon: "return" },
      { label: "Battery Pre-Bill", path: "/battery", icon: "battery" }
    ]
  },
  {
    title: "Monitoring",
    items: [
      { label: "Fulfilment", path: "/fulfilment", icon: "chart" },
      { label: "Ageing Report", path: "/ageing", icon: "trend" },
      { label: "Serial History", path: "/serials", icon: "search" },
      { label: "Exceptions", path: "/exceptions", icon: "warning" }
    ]
  },
  {
    title: "Administration",
    items: [
      { label: "Import Monitor", path: "/imports", icon: "import" }
    ]
  }
];

export function Sidebar({ open, onClose, user }) {
  const { user: authUser, logout } = useAuth();
  const displayUser = user ?? {
    name: authUser?.userId || "Unauthenticated",
    role: authUser?.role || "No role"
  };

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} aria-hidden="true" />}
      <aside className={`sidebar ${open ? "sidebar--open" : ""}`} aria-label="Main navigation">
        <div className="sidebar__brand">
          <div className="sidebar__brand-logo">
            <img src="/logo/microtek_logo.png" alt="Microtek logo" />
          </div>
          <span className="sidebar__brand-name">Microtek IDM</span>
        </div>

        <nav className="sidebar__nav">
          <div className="sidebar__section">
            <NavLink
              to="/dashboard"
              className={({ isActive }) => `sidebar__link ${isActive ? "sidebar__link--active" : ""}`}
              onClick={onClose}
              end
            >
              <Icon name="chart" className="sidebar__link-icon" />
              Dashboard
            </NavLink>
          </div>

          {navSections.map((section) => (
            <div key={section.title} className="sidebar__section">
              <div className="sidebar__section-title">{section.title}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => `sidebar__link ${isActive ? "sidebar__link--active" : ""}`}
                  onClick={onClose}
                >
                  <Icon name={item.icon} className="sidebar__link-icon" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__user">
            <div className="sidebar__user-avatar">
              {displayUser.name.charAt(0).toUpperCase()}
            </div>
            <div className="sidebar__user-info">
              <div className="sidebar__user-name">{displayUser.name}</div>
              <div className="sidebar__user-role">{displayUser.role}</div>
            </div>
          </div>
          <button className="sidebar__logout" type="button" onClick={logout}>
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
