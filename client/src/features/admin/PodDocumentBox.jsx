import { useState } from "react";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";

/* Display-only POD Document panel (matches the reference layout). Upload is not
   wired up yet — the edit button just surfaces that it's coming. */
export function PodDocumentBox() {
  const [showNote, setShowNote] = useState(false);
  return (
    <Card title="POD Document">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-2)" }}>
        <Button variant="secondary" size="sm" onClick={() => setShowNote(true)} aria-label="Edit POD document">
          ✎
        </Button>
      </div>
      <p style={{ textAlign: "center", color: "var(--color-text-muted)", padding: "var(--space-6) 0", margin: 0 }}>
        Currently No Document Found...
      </p>
      {showNote && (
        <p style={{ textAlign: "center", fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
          Document upload isn’t enabled yet.
        </p>
      )}
    </Card>
  );
}
