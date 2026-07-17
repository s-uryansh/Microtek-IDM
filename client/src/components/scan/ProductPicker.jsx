// Product-first selection, shared by the scan workflows (GRN, Dispatch, Battery
// Pre-Billing, SRN). The operator picks which invoice/dispatch-listed product they
// are about to scan (e.g. Inverter vs Controller) BEFORE scanning its serials, so
// each scan can be scoped to that product line. The selected productId is forwarded
// to the backend as `expectedProductId`, which (a) disambiguates a base serial
// shared by several products to the selected product's row and (b) rejects a scan
// whose resolved product does not match the selection (PRODUCT_INVOICE_MISMATCH).
//
// Operators scan the raw base serial (see migration V027), so this product context
// is what lets a shared base serial resolve to the right row.
export function ProductPicker({ items, selectedProductId, onSelect, renderMeta }) {
  const rows = Array.isArray(items) ? items : [];
  if (rows.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }} role="group" aria-label="Select product to scan">
      {rows.map((item) => {
        const active = item.productId === selectedProductId;
        return (
          <button
            key={`${item.productId}-${item.invoiceLineId ?? item.batchNo ?? ""}`}
            type="button"
            aria-pressed={active}
            className={`button ${active ? "button--primary" : "button--secondary"}`}
            onClick={() => onSelect(item.productId)}
            style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.125rem" }}
          >
            <span style={{ fontWeight: 600 }}>{item.productName}</span>
            <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>
              {typeof renderMeta === "function" ? renderMeta(item) : item.productCode}
            </span>
          </button>
        );
      })}
    </div>
  );
}
