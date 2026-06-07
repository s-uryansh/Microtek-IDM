export function Input({ label, error, className = "", id, onChange, ...props }) {
  const inputId = id || `input-${label?.toLowerCase().replace(/\s+/g, "-")}`;

  function handleChange(e) {
    onChange?.(e.target.value);
  }

  return (
    <div className="input-group">
      {label && (
        <label className="input-group__label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`input ${error ? "input--error" : ""} ${className}`.trim()}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        onChange={onChange ? handleChange : undefined}
        {...props}
      />
      {error && (
        <span className="input-group__error" id={`${inputId}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
