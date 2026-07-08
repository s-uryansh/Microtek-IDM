import { useState } from "react";

import { Button } from "./Button.jsx";

// Uncontrolled by default (defaultOpen); pass open+onOpenChange to drive it
// externally (e.g. auto-expand an editor when a list row is clicked).
export function Collapsible({
  title,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  openLabel,
  closeLabel,
  children
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  function toggle() {
    const next = !isOpen;
    if (isControlled) {
      onOpenChange?.(next);
    } else {
      setUncontrolledOpen(next);
    }
  }

  return (
    <div className="collapsible">
      <Button variant="secondary" size="sm" onClick={toggle} aria-expanded={isOpen}>
        {isOpen ? (closeLabel || `Hide ${title}`) : (openLabel || `Show ${title}`)}
      </Button>
      {isOpen && (
        <div className="collapsible__content" style={{ marginTop: "var(--space-3)" }}>
          {children}
        </div>
      )}
    </div>
  );
}
