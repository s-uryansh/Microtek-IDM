export function Skeleton({ variant = "text", className = "", ...props }) {
  return (
    <div
      className={`skeleton skeleton--${variant} ${className}`.trim()}
      aria-hidden="true"
      {...props}
    />
  );
}
