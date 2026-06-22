import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { DataTable } from "../../components/data/DataTable.jsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";
import { fetchHeldStock, correctConditionTag } from "../../api/modules/condition.js";

// Serials returned as DEFECTIVE or REPAIR sit in stock on hold and cannot be
// dispatched. This screen lets an authorised user inspect them and clear the
// hold by retagging — typically back to SALEABLE once the unit is fit to sell.
const TARGET_TAGS = ["SALEABLE", "REPAIR", "DEFECTIVE"];

export function ConditionPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busySerial, setBusySerial] = useState(null);
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState("");
  const [confirmPending, setConfirmPending] = useState(null);
  const { showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchHeldStock();
      setItems(result?.items || []);
    } catch (err) {
      setError(err?.message || "Failed to load held stock");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const doRetag = useCallback(
    async (serialNo, conditionTag) => {
      setBusySerial(serialNo);
      setNotice(null);
      setError(null);
      try {
        await correctConditionTag({ serialNo, conditionTag });
        const msg = conditionTag === "SALEABLE"
          ? `${serialNo} cleared for dispatch (SALEABLE).`
          : `${serialNo} retagged ${conditionTag}.`;
        setNotice(msg);
        showToast({ message: msg, variant: "success" });
        await load();
      } catch (err) {
        setError(err?.message || "Failed to update condition tag");
      } finally {
        setBusySerial(null);
      }
    },
    [load, showToast]
  );

  const handleRetag = useCallback(
    (serialNo, conditionTag) => {
      if (conditionTag === "SALEABLE") {
        setConfirmPending({ serialNo, conditionTag });
      } else {
        doRetag(serialNo, conditionTag);
      }
    },
    [doRetag]
  );

  // Free-text search across serial and product; the per-column dropdowns on the
  // table provide the multi-filter (by condition tag and warehouse).
  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      [item.serialNo, item.productCode].some((value) => String(value ?? "").toLowerCase().includes(term))
    );
  }, [items, search]);

  const columns = useMemo(
    () => [
      { key: "serialNo", label: "Serial", filterable: false },
      { key: "productCode", label: "Product" },
      { key: "conditionTag", label: "Condition" },
      { key: "warehouseId", label: "Warehouse" },
      {
        key: "_actions",
        label: "Correct to",
        sortable: false,
        filterable: false,
        render: (_value, row) => (
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            {TARGET_TAGS.filter((tag) => tag !== row.conditionTag).map((tag) => (
              <Button
                key={tag}
                variant={tag === "SALEABLE" ? "primary" : "secondary"}
                disabled={busySerial === row.serialNo}
                onClick={() => handleRetag(row.serialNo, tag)}
              >
                {busySerial === row.serialNo ? "…" : tag}
              </Button>
            ))}
          </div>
        )
      }
    ],
    [busySerial, handleRetag]
  );

  return (
    <div>
      <PageHeader
        title="Defective / Held Stock"
        subtitle="Returned units on DEFECTIVE or REPAIR hold. Correct the tag to release stock for dispatch."
      />
      <Card title="Stock on condition hold">
        {notice && <p style={{ color: "var(--color-success, green)", fontSize: "0.875rem" }}>{notice}</p>}

        <div className="input-group" style={{ marginBottom: "var(--space-3)" }}>
          <label className="input-group__label" htmlFor="condition-search">Search</label>
          <input
            id="condition-search"
            className="input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by serial or product code"
          />
        </div>

        <DataTable
          columns={columns}
          data={filteredItems}
          loading={loading}
          error={error}
          onRetry={load}
          emptyTitle="No stock on condition hold"
          emptyDescription="Nothing is currently held as DEFECTIVE or REPAIR."
        />
      </Card>
      <ConfirmDialog
        open={!!confirmPending}
        title="Mark as Saleable"
        message={confirmPending ? `Mark ${confirmPending.serialNo} as SALEABLE? This will release it for dispatch.` : ""}
        confirmLabel="Mark Saleable"
        cancelLabel="Cancel"
        variant="primary"
        onConfirm={() => {
          const pending = confirmPending;
          setConfirmPending(null);
          doRetag(pending.serialNo, pending.conditionTag);
        }}
        onCancel={() => setConfirmPending(null)}
        busy={!!busySerial}
      />
    </div>
  );
}
