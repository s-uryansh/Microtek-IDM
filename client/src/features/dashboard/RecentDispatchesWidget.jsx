import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { EmptyState } from "../../components/ui/EmptyState.jsx";
import { Skeleton } from "../../components/ui/Skeleton.jsx";

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function RecentDispatchesWidget({ dispatches, loading }) {
  return (
    <Card title="Recent Dispatches">
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} height={28} />)}
        </div>
      ) : !dispatches?.length ? (
        <EmptyState title="No recent dispatches" description="" />
      ) : (
        <div className="recent-list">
          {dispatches.map((d) => (
            <div key={d.dispatchId} className="recent-list__item">
              <div className="recent-list__info">
                <span className="recent-list__id">Dispatch #{d.dispatchId}</span>
                <span className="recent-list__meta">
                  Invoice #{d.invoiceId} · {d.warehouseCode ?? `WH-${d.warehouseId}`} · {fmtTime(d.createdAt)}
                </span>
              </div>
              <StatusBadge status={d.status} />
            </div>
          ))}
          <Link to="/dispatch" className="recent-list__viewall">View all Dispatches →</Link>
        </div>
      )}
    </Card>
  );
}
