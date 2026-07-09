import { useEffect } from "react";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Collapsible } from "../../components/ui/Collapsible.jsx";

// Groups the flat {category, subCategory, productId, productCode, productName, count}
// rows from the dashboard's stockBreakdown into a Category -> Sub Category -> Product tree.
function groupStock(rows) {
  const byCategory = new Map();
  for (const row of rows) {
    const categoryKey = row.category || "—";
    if (!byCategory.has(categoryKey)) {
      byCategory.set(categoryKey, { total: 0, subCategories: new Map() });
    }
    const catEntry = byCategory.get(categoryKey);
    catEntry.total += row.count;

    const subKey = row.subCategory || "—";
    if (!catEntry.subCategories.has(subKey)) {
      catEntry.subCategories.set(subKey, { total: 0, products: [] });
    }
    const subEntry = catEntry.subCategories.get(subKey);
    subEntry.total += row.count;
    subEntry.products.push(row);
  }
  return byCategory;
}

export function StockBreakdownPanel({ data, loading, onClose }) {
  const grouped = groupStock(data || []);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="dialog-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="dialog dialog--wide" role="dialog" aria-modal="true" aria-label="In-Stock Breakdown">
        <Card title="In-Stock Breakdown">
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-2)" }}>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
          {loading && <p style={{ color: "var(--color-text-muted)" }}>Loading...</p>}
          {!loading && grouped.size === 0 && (
            <p style={{ color: "var(--color-text-muted)" }}>No in-stock units.</p>
          )}
          {!loading &&
            Array.from(grouped.entries()).map(([category, catEntry]) => (
              <div key={category} style={{ marginBottom: "var(--space-2)" }}>
                <Collapsible
                  title={category}
                  openLabel={`${category} (${catEntry.total})`}
                  closeLabel={`Hide ${category}`}
                >
                  {Array.from(catEntry.subCategories.entries()).map(([subCategory, subEntry]) => (
                    <div key={subCategory} style={{ marginLeft: "var(--space-4)", marginTop: "var(--space-2)" }}>
                      <Collapsible
                        title={subCategory}
                        openLabel={`${subCategory} (${subEntry.total})`}
                        closeLabel={`Hide ${subCategory}`}
                      >
                        <ul style={{ marginLeft: "var(--space-4)", listStyle: "none", padding: 0 }}>
                          {subEntry.products.map((p) => (
                            <li
                              key={p.productId}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                padding: "var(--space-1) 0",
                                borderBottom: "1px solid var(--color-border)"
                              }}
                            >
                              <span>
                                {p.productName}{" "}
                                <span style={{ color: "var(--color-text-muted)", fontSize: "0.8125rem" }}>
                                  ({p.productCode})
                                </span>
                              </span>
                              <span style={{ fontFamily: "var(--font-mono)" }}>{p.count}</span>
                            </li>
                          ))}
                        </ul>
                      </Collapsible>
                    </div>
                  ))}
                </Collapsible>
              </div>
            ))}
        </Card>
      </div>
    </div>
  );
}
