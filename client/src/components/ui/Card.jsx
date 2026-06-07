export function Card({ className = "", title, children, ...props }) {
  return (
    <div className={`card ${className}`.trim()} {...props}>
      {title && (
        <div className="card__header" data-testid="card-header">
          <h3 className="card__title">{title}</h3>
        </div>
      )}
      <div className="card__body" data-testid="card-body">
        {children}
      </div>
    </div>
  );
}
