import { NavLink } from "react-router-dom";
import { useAuth } from "../../auth/useAuth.js";
import { Icon } from "../ui/Icon.jsx";

// Each nav item declares the RBAC permission required to use its page. Items the
// signed-in user lacks permission for are hidden, and any section left empty is
// dropped entirely. Permissions come from the server via the auth context.
const navSections = [
  {
    title: "Operations",
    items: [
      { label: "GRN", path: "/grn", icon: "box", permission: "grn:write" },
      { label: "Dispatch", path: "/dispatch", icon: "truck", permission: "dispatch:write" },
      { label: "SRN", path: "/srn", icon: "return", permission: "srn:write" },
      { label: "Defective Stock", path: "/condition", icon: "warning", permission: "condition:correct" },
      { label: "Battery Pre-Bill", path: "/battery", icon: "battery", permission: "battery:read" }
    ]
  },
  {
    title: "Monitoring",
    items: [
      { label: "Fulfilment", path: "/fulfilment", icon: "chart", permission: "fulfilment:read" },
      { label: "Ageing Report", path: "/ageing", icon: "trend", permission: "ageing:read" },
      { label: "Serial History", path: "/serials", icon: "search", permission: "serial-history:read" },
      { label: "Exceptions", path: "/exceptions", icon: "warning", permission: "exception:read" }
    ]
  },
  {
    title: "Integration",
    items: [
      { label: "Import Production (CSV)", path: "/imports", icon: "box", permission: "integration:import" }
    ]
  },
  {
    title: "Administration",
    items: [
      { label: "Warehouses", path: "/admin/warehouses", icon: "box", permission: "admin:access" },
      { label: "Members", path: "/admin/members", icon: "document", permission: "admin:access" },
      { label: "Roles", path: "/admin/roles", icon: "document", permission: "admin:access" },
      { label: "Products", path: "/admin/products", icon: "box", permission: "admin:access" },
      { label: "Invoices", path: "/admin/invoices", icon: "document", permission: "invoice:read" },
      { label: "Inbound Stock", path: "/admin/inbound", icon: "truck", permission: "admin:access" },
      { label: "Warehouse Stock", path: "/admin/stock", icon: "search", permission: "admin:access" }
    ]
  }
];

export function Sidebar({ open, onClose, user }) {
  const { user: authUser, logout, hasPermission } = useAuth();
  const canAccess = (permission) => authUser?.role === "admin" || (typeof hasPermission === "function" ? hasPermission(permission) : false);
  const displayUser = user ?? {
    name: authUser?.userId || "Unauthenticated",
    role: authUser?.role || "No role"
  };
  const sections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccess(item.permission))
    }))
    .filter((section) => section.items.length > 0);

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

          {sections.map((section) => (
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
