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

export function RecentGrnsWidget({ grns, loading }) {
  return (
    <Card title="Recent GRNs">
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} height={28} />)}
        </div>
      ) : !grns?.length ? (
        <EmptyState title="No recent GRNs" description="" />
      ) : (
        <div className="recent-list">
          {grns.map((g) => (
            <div key={g.grnId} className="recent-list__item">
              <div className="recent-list__info">
                <span className="recent-list__id">GRN #{g.grnId}</span>
                <span className="recent-list__meta">
                  {g.warehouseCode ?? `WH-${g.warehouseId}`} · {fmtTime(g.createdAt)}
                </span>
              </div>
              <StatusBadge status={g.status} />
            </div>
          ))}
          <Link to="/grn" className="recent-list__viewall">View all GRNs →</Link>
        </div>
      )}
    </Card>
  );
}
