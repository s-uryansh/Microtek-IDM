# Security Audit Report (Draft) — Microtek IDM

**Type:** Preliminary / pre-implementation design review
**Basis:** SOW scope, proposed architecture (SAP bidirectional integration, mobile app, web portal, separate IDM DB), and the existing DMS integration patterns observed in the process-flow document.
**Status:** Draft — to be re-run as a full assessment against the implemented system before production go-live.

> This is a design-stage review of *proposed* API design and data handling. It identifies likely vulnerability classes and the mitigations to bake in from Sprint 0, not findings against running code. Severity reflects risk to a serial-level inventory system feeding a financial ERP.

---

## 1. Scope & Threat Surface

The IDM exposes four trust boundaries:
1. **Mobile app ↔ IDM API** — warehouse staff scanning at 27+ sites, possibly over public/cellular networks.
2. **IDM ↔ SAP** — bidirectional; outbound writes *reconcile SAP inventory*, so a compromise here can corrupt the ERP's view of stock.
3. **Web portal ↔ IDM API** — supervisors running reports and posting exception corrections (privileged).
4. **IDM ↔ (future) SFA/DMS** — Phase 3 read APIs.

The crown-jewel assets are the **serial master**, the **exception-correction capability** (can rewrite inventory truth), and the **SAP outbound channel**.

## 2. Findings & Mitigations

### S-1 — Authentication & session management — **High**
**Risk:** Weak or shared credentials on shared warehouse devices; long-lived sessions; the existing DMS uses mobile-number + OTP login, which is convenient but phishable and SIM-swap-exposed if reused here without hardening.
**Mitigations:**
- Centralised auth with short-lived access tokens + rotating refresh tokens; bind sessions to device where feasible.
- Per-user accounts (no shared logins) even on shared scanners; fast user-switch with re-auth.
- If OTP is retained for parity with DMS, add rate-limiting, attempt lockout, OTP expiry, and step-up auth for privileged web actions (exception correction, config). Consider TOTP/app-based MFA for portal admins rather than SMS OTP alone.
- Enforce idle and absolute session timeouts.

### S-2 — Authorization / broken access control — **High**
**Risk:** A warehouse user accessing another warehouse's serials or stock; a non-authorised user posting exception corrections (IDM-10) or viewing financial invoice data. Broken object-level authorization (IDOR) is the most common API flaw and directly relevant here (every endpoint takes a serial/warehouse/invoice ID).
**Mitigations:**
- Server-side RBAC keyed on the role hierarchy (OI-9): scope every query to the caller's authorised warehouse(s); never trust a warehouse/role claim sent by the client.
- Enforce object-level checks on every `serial_id`/`warehouse_id`/`invoice_id` access, not just at the menu/UI level.
- Exception correction and configuration are privileged operations requiring an explicit permission + step-up auth (ties to S-1).
- Default-deny; least privilege; separate read vs. write permissions for reports vs. corrections.

### S-3 — SAP integration channel integrity — **High**
**Risk:** The outbound IDM→SAP feed rewrites SAP inventory; spoofed, tampered, or replayed payloads could corrupt the ERP. File/FTP-based exchange (as used in the existing DMS) is especially exposed if it relies on plaintext FTP or an unauthenticated drop folder.
**Mitigations:**
- Mutual TLS / signed requests on API or middleware channels; **SFTP (not plain FTP)** with key-based auth and integrity checks if a file pattern is chosen.
- Per-batch signing/checksums and the `integration_batch` idempotency key (see SQL Plan) to defeat replay and detect tampering.
- Whitelist source/destination; segregate the integration credential from app credentials; rotate secrets.
- Reconciliation gate: outbound confirmed-serial batches are validated and logged before SAP applies them; anomalies quarantine rather than auto-post.

### S-4 — Sensitive data exposure / encryption — **Medium-High**
**Risk:** Invoice, customer-dispatch, and (for returns/finance-adjacent flows) potentially personal data in transit/at rest; verbose API responses leaking more than the UI needs.
**Mitigations:**
- TLS 1.2+ everywhere (no plaintext endpoints, including internal integration hops).
- Encryption at rest for the IDM DB and document/attachment storage; managed key store with rotation.
- Field minimisation in API responses (return only what the screen needs); no internal IDs/stack traces in errors.
- Classify data; if any PII is captured at SRN/customer-dispatch, apply retention limits and masking in reports/exports.

### S-5 — Input validation & injection — **Medium**
**Risk:** Scanned serials, search filters, and CSV/file imports are untrusted input → SQL injection, CSV-formula injection in exported reports, and malformed-scan crashes.
**Mitigations:**
- Parameterised queries / ORM exclusively; no string-built SQL.
- Strict serial-format validation server-side; reject and log malformed scans as exceptions (IDM-06), don't crash.
- Sanitise spreadsheet exports against CSV-injection (`=,+,-,@` prefixes); cap import file size and validate structure (mirror the DMS uploader validation discipline).

### S-6 — Audit logging & non-repudiation — **Medium (compliance-critical)**
**Risk:** Inadequate or mutable logs undermine the very auditability IDM exists to provide; exception corrections without firm attribution enable inventory fraud.
**Mitigations:**
- Append-only `serial_event` and `exception_log` (see SQL Plan); never update history in place.
- Every state-changing action (scan, dispatch, GRN, SRN, correction, config change) logged with user, timestamp (UTC), source device/warehouse, before/after.
- Tamper-evidence (e.g., write-once storage or hash-chaining) for the audit trail; restrict log read access; protect logs from app-level deletion.
- Retain per the client's compliance/regulatory requirement (confirm).

### S-7 — Rate limiting, abuse & availability — **Medium**
**Risk:** The ~1s validation endpoint (AC-6) is a DoS-attractive hot path; unbounded report/history queries can be weaponised; brute-force on OTP/login.
**Mitigations:**
- Per-user/per-IP rate limits and quotas on validation, login/OTP, and report endpoints.
- Pagination and server-side bounds on history/ageing queries (large date ranges already flagged as a perf risk in the DMS).
- Resource isolation so heavy reporting cannot starve the scanning hot path.

### S-8 — Mobile & offline-sync security — **Medium** (conditional on OI-2)
**Risk:** If offline mode is adopted, locally queued scans become a tamper/leak surface; lost/stolen devices expose cached data.
**Mitigations:**
- Encrypt local queue/cache; sign queued transactions; reconcile/deduplicate on sync (idempotent server side).
- Remote wipe / device attestation where supported; no long-term credential storage on device.
- Treat synced offline scans as untrusted until server-validated.

### S-9 — Secrets & configuration management — **Medium**
**Risk:** Hard-coded SAP/DB/integration credentials; secrets in source or config files (a common real-world leak).
**Mitigations:** Centralised secret manager; no secrets in code or images; environment separation; least-privilege service accounts; rotation policy.

### S-10 — Third-party / Phase 3 API exposure — **Low now, High at Phase 3**
**Risk:** SFA/DMS read APIs (IDM-11) widen the surface; over-permissive APIs leak serial/financial data.
**Mitigations:** Versioned, authenticated, scoped read-only APIs; per-consumer credentials and quotas; contract tests; re-run this audit before Phase 3 launch.

## 3. Summary & Prioritisation

| Finding | Area | Severity | Bake in by |
|---------|------|----------|------------|
| S-1 | AuthN / session | High | Sprint 0–1 |
| S-2 | AuthZ / access control | High | Sprint 0–1 |
| S-3 | SAP channel integrity | High | Sprint 1–2 |
| S-4 | Encryption / data exposure | Med-High | Sprint 0–1 |
| S-5 | Input validation / injection | Medium | Each feature sprint |
| S-6 | Audit logging | Medium (compliance) | Sprint 1 onward |
| S-7 | Rate limiting / availability | Medium | Sprint 3–6 |
| S-8 | Mobile / offline | Medium | Conditional (OI-2) |
| S-9 | Secrets management | Medium | Sprint 0 |
| S-10 | Phase 3 APIs | Low→High | Before Phase 3 |

## 4. Recommended Next Steps

1. Confirm the role hierarchy (OI-9) and integration mechanism (OI-7) — both gate the High findings.
2. Adopt a security baseline checklist per sprint (parameterised queries, object-level authz, no secrets in code).
3. Schedule a full assessment against the implemented system — including authenticated penetration testing of the API and a review of the live SAP channel — before production go-live, and again before Phase 3.

---

*Draft for internal review. Not a substitute for a formal penetration test or a compliance audit against Microtek's regulatory obligations.*
