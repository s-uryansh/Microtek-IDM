import { useState } from "react";
import { Outlet } from "react-router-dom";

import { Sidebar } from "./Sidebar.jsx";
import { TopBar } from "./TopBar.jsx";

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <TopBar onMenuToggle={() => setSidebarOpen((prev) => !prev)} />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
