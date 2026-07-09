import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { WarehousesTab } from "./WarehousesTab.jsx";
import { MembersTab } from "./MembersTab.jsx";
import { RolesTab } from "./RolesTab.jsx";
import { ProductsTab } from "./ProductsTab.jsx";
import { InvoicesTab } from "./InvoicesTab.jsx";
import { InboundTab } from "./InboundTab.jsx";
import { StockTab } from "./StockTab.jsx";

const TABS = [
  { key: "warehouses", label: "Warehouses" },
  { key: "members", label: "Members" },
  { key: "roles", label: "Roles" },
  { key: "products", label: "Products" },
  { key: "invoices", label: "Invoices" },
  { key: "inbound", label: "Inbound Stock" },
  { key: "stock", label: "Warehouse Stock" }
];

function AdminModulePage({ title, subtitle, children }) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      {children}
    </div>
  );
}

export function WarehousesPage() {
  return (
    <AdminModulePage title="Warehouses" subtitle="Create, deactivate, and review warehouse masters">
      <WarehousesTab />
    </AdminModulePage>
  );
}

export function MembersPage() {
  return (
    <AdminModulePage title="Members" subtitle="Manage IDM users, roles, and warehouse assignments">
      <MembersTab />
    </AdminModulePage>
  );
}

export function RolesPage() {
  return (
    <AdminModulePage title="Roles" subtitle="Configure role names and permission grants">
      <RolesTab />
    </AdminModulePage>
  );
}

export function ProductsPage() {
  return (
    <AdminModulePage title="Products" subtitle="Import, export, and review product masters">
      <ProductsTab />
    </AdminModulePage>
  );
}

export function InvoicesPage() {
  return (
    <AdminModulePage title="Invoices" subtitle="Review invoices, apply stacked filters, and export CSV data">
      <InvoicesTab />
    </AdminModulePage>
  );
}

export function InboundPage() {
  return (
    <AdminModulePage title="Inbound Stock" subtitle="Review SAP dispatch documents received by warehouses">
      <InboundTab />
    </AdminModulePage>
  );
}

export function StockPage() {
  return (
    <AdminModulePage title="Warehouse Stock" subtitle="Review every serial currently in warehouse stock">
      <StockTab />
    </AdminModulePage>
  );
}

export function AdminPage() {
  const [activeTab, setActiveTab] = useState("warehouses");

  return (
    <div>
      <PageHeader title="Masters" subtitle="Warehouse, product, and invoice management" />

      <div style={{ display: "flex", gap: "var(--space-1)", marginBottom: "var(--space-4)", borderBottom: "1px solid var(--color-border)" }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "var(--space-2) var(--space-4)",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid var(--color-primary)" : "2px solid transparent",
              backgroundColor: "transparent",
              cursor: "pointer",
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? "var(--color-primary)" : "var(--color-text-muted)",
              fontSize: "0.875rem"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "warehouses" && <WarehousesTab />}
      {activeTab === "members" && <MembersTab />}
      {activeTab === "roles" && <RolesTab />}
      {activeTab === "products" && <ProductsTab />}
      {activeTab === "invoices" && <InvoicesTab />}
      {activeTab === "inbound" && <InboundTab />}
      {activeTab === "stock" && <StockTab />}
    </div>
  );
}
