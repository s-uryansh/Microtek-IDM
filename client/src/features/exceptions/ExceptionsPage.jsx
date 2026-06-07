import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { DataTable } from "../../components/data/DataTable.jsx";
import { fetchExceptions, fetchException, correctException } from "../../api/modules/exceptions.js";

const columns = [
  { key: "exceptionId", label: "ID" },
  { key: "serialNo", label: "Serial No" },
  { key: "ruleCode", label: "Rule" },
  { key: "contextType", label: "Context" },
  { key: "status", label: "Status" },
  { key: "raisedAt", label: "Raised At" }
];

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function ExceptionsPage() {
  const [exceptions, setExceptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [correcting, setCorrecting] = useState(false);

  const loadExceptions = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchExceptions({ status: statusFilter || undefined })
      .then((data) => setExceptions(data ?? { exceptions: [], total: 0 }))
      .catch((err) => {
        setError(err?.message || "Failed to load exceptions");
        setExceptions({ exceptions: [], total: 0 });
      })
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => {
    loadExceptions();
  }, [loadExceptions]);

  async function handleViewDetail(exceptionId) {
    setDetail(null);
    setDetailError(null);
    setSelected(exceptionId);
    try {
      const data = await fetchException({ exceptionId });
      setDetail(data);
    } catch (err) {
      setDetailError(err?.message || "Failed to load exception");
    }
  }

  async function handleCorrect() {
    if (!correctionReason.trim() || !selected) return;
    setCorrecting(true);
    try {
      const result = await correctException({ exceptionId: selected, correctionReason });
      setDetail(result);
      loadExceptions();
      setCorrectionReason("");
    } catch (err) {
      setDetailError(err?.message || "Correction failed");
    } finally {
      setCorrecting(false);
    }
  }

  const list = toArray(exceptions?.exceptions);
  const total = typeof exceptions?.total === "number" ? exceptions.total : 0;

  return (
    <div>
      <PageHeader
        title="Exception Portal"
        subtitle="Review and correct exceptions"
        actions={
          <div className="page-header__control-row">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input"
              aria-label="Filter by status"
            >
              <option value="">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="CORRECTED">Corrected</option>
              <option value="DISMISSED">Dismissed</option>
            </select>
            <Button onClick={loadExceptions} variant="secondary" size="sm">Refresh</Button>
          </div>
        }
      />

      <div className={`warehouse-grid ${selected ? "warehouse-grid--two" : ""}`.trim()}>
        <Card title="Exception List">
          <DataTable
            columns={columns}
            data={list}
            loading={loading}
            error={error}
            onRetry={loadExceptions}
            pageSize={10}
            onRowClick={(row) => handleViewDetail(row?.exceptionId)}
          />
          {exceptions && (
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.75rem", marginTop: "var(--space-2)" }}>
              Showing {list.length} of {total} total
            </p>
          )}
        </Card>

        {selected && (
          <Card title={detail ? `Exception #${detail.exceptionId}` : `Exception #${selected}`}>
            {detailError && (
              <div
                style={{
                  padding: "var(--space-3)",
                  backgroundColor: "var(--color-error-subtle)",
                  color: "var(--color-error)",
                  borderRadius: "var(--radius-md)",
                  fontSize: "0.875rem"
                }}
                role="alert"
              >
                {detailError}
              </div>
            )}
            {detail && !detailError && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                <div><span style={{ color: "var(--color-text-muted)" }}>Serial:</span> {detail.serialNo || "N/A"}</div>
                <div><span style={{ color: "var(--color-text-muted)" }}>Rule:</span> {detail.ruleCode}</div>
                <div><span style={{ color: "var(--color-text-muted)" }}>Context:</span> {detail.contextType} {detail.contextId && `#${detail.contextId}`}</div>
                <div><span style={{ color: "var(--color-text-muted)" }}>Status:</span> {detail.status}</div>
                <div><span style={{ color: "var(--color-text-muted)" }}>Raised:</span> {new Date(detail.raisedAt).toLocaleString()}</div>
                <div><span style={{ color: "var(--color-text-muted)" }}>Raised by:</span> {detail.raisedBy}</div>
                {detail.correctedAt && (
                  <>
                    <div><span style={{ color: "var(--color-text-muted)" }}>Corrected:</span> {new Date(detail.correctedAt).toLocaleString()}</div>
                    <div><span style={{ color: "var(--color-text-muted)" }}>Corrected by:</span> {detail.correctedBy}</div>
                    <div><span style={{ color: "var(--color-text-muted)" }}>Reason:</span> {detail.correctionReason}</div>
                  </>
                )}

                {detail.status === "OPEN" && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--space-3)",
                      marginTop: "var(--space-4)",
                      paddingTop: "var(--space-4)",
                      borderTop: "1px solid var(--color-border)"
                    }}
                  >
                    <Input
                      label="Correction Reason (required)"
                      value={correctionReason}
                      onChange={setCorrectionReason}
                      placeholder="Enter reason for correction"
                    />
                    <Button onClick={handleCorrect} disabled={!correctionReason.trim() || correcting}>
                      {correcting ? "Correcting..." : "Correct Exception"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
