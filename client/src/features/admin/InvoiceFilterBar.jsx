import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";

export function InvoiceFilterBar({
  filters,
  updateFilter,
  customerOptions,
  billingOptions,
  orderOptions,
  dispatchStatusOptions,
  canExportInvoices,
  onExport,
  onClearFilters
}) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "flex-end", marginBottom: "var(--space-3)", flexWrap: "wrap" }}>
        <div style={{ minWidth: 260, flex: 1 }}>
          <Input
            label="Search Invoices"
            value={filters.search}
            onChange={(value) => updateFilter("search", value)}
            placeholder="Invoice ref, ID, order ID, customer name..."
          />
        </div>
        {canExportInvoices && (
          <Button variant="secondary" onClick={onExport}>
            Export CSV
          </Button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
        <div className="input-group">
          <label className="input-group__label" htmlFor="invoice-filter-customer">Customer</label>
          <select
            id="invoice-filter-customer"
            className="input"
            value={filters.customer}
            onChange={(e) => updateFilter("customer", e.target.value)}
          >
            <option value="">All customers</option>
            {customerOptions.map((customer) => (
              <option key={customer} value={customer}>{customer}</option>
            ))}
          </select>
        </div>
        <div className="input-group">
          <label className="input-group__label" htmlFor="invoice-filter-dispatch-status">Dispatch Status</label>
          <select
            id="invoice-filter-dispatch-status"
            className="input"
            value={filters.dispatchStatus}
            onChange={(e) => updateFilter("dispatchStatus", e.target.value)}
          >
            <option value="">All statuses</option>
            {dispatchStatusOptions.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
        <div className="input-group">
          <label className="input-group__label" htmlFor="invoice-filter-billing">Billing Number</label>
          <select
            id="invoice-filter-billing"
            className="input"
            value={filters.billingNumber}
            onChange={(e) => updateFilter("billingNumber", e.target.value)}
          >
            <option value="">All billing numbers</option>
            {billingOptions.map((billingNumber) => (
              <option key={billingNumber} value={billingNumber}>{billingNumber}</option>
            ))}
          </select>
        </div>
        <div className="input-group">
          <label className="input-group__label" htmlFor="invoice-filter-order">Order ID</label>
          <select
            id="invoice-filter-order"
            className="input"
            value={filters.orderId}
            onChange={(e) => updateFilter("orderId", e.target.value)}
          >
            <option value="">All order IDs</option>
            {orderOptions.map((orderId) => (
              <option key={orderId} value={orderId}>{orderId}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <Button variant="secondary" onClick={onClearFilters}>
            Clear Filters
          </Button>
        </div>
      </div>
    </>
  );
}
