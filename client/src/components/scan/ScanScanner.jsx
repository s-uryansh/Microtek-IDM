import { ScanInput } from "./ScanInput.jsx";

export function ScanScanner({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  feedbackState,
  autoSubmit = true
}) {
  return (
    <section className="scan-scanner" aria-label="Hardware scanner">
      <ScanInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        disabled={disabled}
        placeholder={placeholder}
        feedbackState={feedbackState}
        autoSubmit={autoSubmit}
      />
      <div className="scan-scanner__mode" aria-live="polite">
        Hardware scanner mode: focus once, scan continuously, Enter submits automatically.
      </div>
    </section>
  );
}
