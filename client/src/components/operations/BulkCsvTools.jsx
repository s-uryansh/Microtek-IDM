import { useRef, useState } from "react";

import { downloadCsv, parseCsv } from "../../utils/csv.js";
import { Button } from "../ui/Button.jsx";

export function BulkCsvTools({
  title = "Bulk CSV",
  templateHeaders,
  templateFilename,
  importLabel = "Import CSV",
  exportLabel = "Export CSV",
  exportFilename,
  exportRows = [],
  exportHeaders = templateHeaders,
  disabled = false,
  onImportRow
}) {
  const fileRef = useRef(null);
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const rejectedRows = summary?.rejectedRows || [];

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || typeof onImportRow !== "function") return;

    setBusy(true);
    const rejected = [];
    let successful = 0;
    try {
      const parsed = parseCsv(await file.text());
      for (const row of parsed.rows) {
        try {
          const result = await onImportRow(row);
          if (result?.state === "error") {
            rejected.push({ ...row, error: result.message || result.status || "Rejected" });
          } else {
            successful += 1;
          }
        } catch (err) {
          rejected.push({ ...row, error: err?.message || "Rejected" });
        }
      }
      setSummary({
        total: parsed.rows.length,
        successful,
        rejected: rejected.length,
        rejectedRows: rejected
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="operation-panel" aria-label={title}>
      <div className="operation-panel__header">
        <div>
          <h3 className="operation-panel__title">{title}</h3>
          <p className="operation-panel__hint">CSV fallback for scanning failures and large batches.</p>
        </div>
      </div>
      <div className="operation-panel__actions">
        <Button
          type="button"
          variant="secondary"
          onClick={() => downloadCsv(templateFilename, [emptyTemplateRow(templateHeaders)], templateHeaders)}
        >
          Download Template
        </Button>
        {onImportRow && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={handleFile}
            />
            <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} disabled={disabled || busy}>
              {busy ? "Importing..." : importLabel}
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={() => downloadCsv(exportFilename, exportRows, exportHeaders)}
          disabled={!exportRows.length}
        >
          {exportLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => downloadCsv("rejected-rows.csv", rejectedRows, [...templateHeaders, "error"])}
          disabled={!rejectedRows.length}
        >
          Download Rejected
        </Button>
      </div>
      {summary && (
        <p className="operation-panel__summary" role="status">
          {summary.total} rows imported. {summary.successful} successful. {summary.rejected} rejected.
        </p>
      )}
    </section>
  );
}

function emptyTemplateRow(headers) {
  return headers.reduce((row, header) => ({ ...row, [header]: "" }), {});
}
