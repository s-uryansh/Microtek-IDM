import { useEffect, useId, useRef } from "react";

export function ScanInput({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = "Scan or enter serial number",
  label = "Scan Serial",
  className = "",
  feedbackState = "idle",
  autoSubmit = true
}) {
  const inputRef = useRef(null);
  const inputId = useId();
  const hintId = useId();

  useEffect(() => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  }, [disabled, value]);

  function handleKeyDown(e) {
    if (autoSubmit && e.key === "Enter" && !disabled) {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        onSubmit(trimmed);
      }
    }
  }

  const feedbackClass = feedbackState !== "idle"
    ? `scan-input--${feedbackState}`
    : "";

  return (
    <div className={`scan-input ${feedbackClass} ${className}`.trim()}>
      <label className="scan-input__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="scan-input__wrapper">
        <input
          ref={inputRef}
          id={inputId}
          className="scan-input__field"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          spellCheck="false"
          autoCapitalize="off"
          autoCorrect="off"
          inputMode="text"
          enterKeyHint="done"
          aria-describedby={hintId}
        />
        {feedbackState === "success" && (
          <span className="scan-input__icon scan-input__icon--success" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path d="M6 10 L9 13 L14 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
        {feedbackState === "error" && (
          <span className="scan-input__icon scan-input__icon--error" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7 7 L13 13 M13 7 L7 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
        )}
        {feedbackState === "warning" && (
          <span className="scan-input__icon scan-input__icon--warning" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2 L18 17 L2 17 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M10 7 L10 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="10" cy="14" r="0.75" fill="currentColor" />
            </svg>
          </span>
        )}
      </div>
      <span id={hintId} className="scan-input__hint">
        {autoSubmit ? "Press Enter to submit" : "Scanner input ready"}
      </span>
    </div>
  );
}
