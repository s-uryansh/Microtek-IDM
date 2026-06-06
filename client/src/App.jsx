import "./styles.css";

export function App() {
  return (
    <main className="app-shell">
      <section className="status-panel" aria-labelledby="app-title">
        <p className="eyebrow">Sprint 0 foundation</p>
        <h1 id="app-title">Microtek IDM</h1>
        <p className="summary">
          React, Express, and PostgreSQL scaffolding for discovery foundations. IDM business
          workflows remain blocked until design freeze.
        </p>
      </section>
    </main>
  );
}
