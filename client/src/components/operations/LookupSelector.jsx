import { useState } from "react";

import { Button } from "../ui/Button.jsx";
import { Input } from "../ui/Input.jsx";

export function LookupSelector({
  title,
  placeholder,
  search,
  renderItem,
  onSelect,
  helperText = "Search by business reference or ID."
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function handleSearch() {
    setStatus("loading");
    setError("");
    try {
      const result = await search(query);
      setItems(Array.isArray(result?.items) ? result.items : []);
      setStatus("done");
    } catch (err) {
      setItems([]);
      setError(err?.message || "Search failed");
      setStatus("error");
    }
  }

  return (
    <section className="operation-panel" aria-label={title}>
      <div className="operation-panel__header">
        <div>
          <h3 className="operation-panel__title">{title}</h3>
          <p className="operation-panel__hint">{helperText}</p>
        </div>
      </div>
      <div className="operation-panel__controls">
        <Input label="Search" value={query} onChange={setQuery} placeholder={placeholder} />
        <Button type="button" variant="secondary" onClick={handleSearch} disabled={status === "loading"}>
          {status === "loading" ? "Searching..." : "Search"}
        </Button>
      </div>
      {error && <p className="operation-panel__error" role="alert">{error}</p>}
      {status === "done" && items.length === 0 && (
        <p className="operation-panel__empty">No matches found.</p>
      )}
      {items.length > 0 && (
        <div className="operation-panel__results">
          {items.map((item) => (
            <button
              key={item.invoiceId || item.sapDispatchDocId || item.dispatchId || item.warehouseId}
              type="button"
              className="operation-panel__result"
              onClick={() => onSelect(item)}
            >
              {renderItem(item)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
