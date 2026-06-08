# Research & Suggestions — Deep Research / Optimization

**Audience:** Microtek + Basiq360 technical and product leadership
**Intent:** forward-looking architectural, technology, and process recommendations beyond the committed scope. Each item notes the problem it addresses and the trade-off, so the team can decide what to adopt now vs. defer.

---

## 1. Architecture

### 1.1 Treat the serial as one canonical identity across IDM *and* the existing DMS
The strongest finding from reviewing both documents: Microtek's existing **DMS already performs serial-level scanning** (QR/coupon codes at distributor dispatch, EWMS lookups, a dispatch-scan sync from SAP every ~2 hours, and a full coupon↔serial mapping). The new IDM also makes the physical serial its system of record. **Two systems claiming authority over the same physical serial is a latent data-integrity and reconciliation problem.**
**Suggestion:** define a single canonical serial identity and an explicit IDM↔DMS reconciliation contract early — even though IDM-11 (SFA/DMS integration) is Phase 3. Decide which system owns which lifecycle stage (e.g., IDM owns warehouse-internal movement; DMS owns channel/loyalty scanning) and where they hand off. This de-risks Phase 3 and avoids divergent serial states.
**Trade-off:** a little coordination cost now to avoid a costly reconciliation/migration later.

### 1.2 Event-sourced serial ledger (already partly designed in)
The append-only `serial_event` table makes IDM-09 (history) trivial and gives free auditability. Lean into this: treat `serial_event` as the **authoritative ledger** and derive `serial_master.current_status` as a projection. This makes "rebuild state from events" and point-in-time queries (e.g., "what was on-hand at this warehouse on date X for ageing") natural.
**Trade-off:** slightly more discipline in writes; large payoff in audit, replay, and reporting flexibility.

### 1.3 Decouple the real-time validation hot path from reporting
IDM-06 has a ~1s SLA and runs at every scan; ageing/history reports are heavy and bursty. Separate them: keep validation on a lean, well-indexed read path (or cache of serial status), and run reporting against a read replica or a separate analytical store. This protects the scanning experience from report load (a problem already noted in the DMS where "large date ranges may impact performance").
**Trade-off:** added infra complexity; justified once OI-5/OI-6 volumes are known.

### 1.4 Idempotent, replayable integration as a first-class concern
The existing DMS already needed a manual "FTP Manual Hit" re-pull mechanism — evidence that batch integrations fail and must be replayable. The `integration_batch` design bakes this in; extend it with a small operator console (batch status, one-click safe replay, variance view) so support staff aren't editing files by hand.

## 2. Technology

### 2.1 Prefer SFTP/API + message queue over plain FTP for the IDM↔SAP legs
The DMS leans on scheduled FTP/CSV. For IDM's outbound *confirmed-serial* leg — which rewrites SAP inventory and is the core mismatch fix — favour an authenticated API/middleware path or at minimum **SFTP with signing**, fronted by a durable queue for retry/back-pressure. Reserve file-based exchange for high-volume, non-time-critical bulk (e.g., the ageing feed). This directly addresses Security finding S-3.
**Trade-off:** depends on OI-7; API paths cost more SAP-side effort but give integrity + near-real-time reconciliation.

### 2.2 Offline-capable mobile with a sync queue (conditional on OI-2)
27 regional warehouses almost certainly include sites with unreliable connectivity. If OI-2 confirms this, build the mobile app **offline-first** from the start (local encrypted queue, server-side idempotent reconciliation) rather than retrofitting — retrofitting offline support is one of the most expensive rewrites in field apps.
**Trade-off:** higher upfront mobile effort; far cheaper than bolting it on after rollout.

### 2.3 Scanning hardware & symbology decision drives real performance (OI-1)
Barcode vs. QR, handheld imager vs. phone camera, materially affects scan throughput and the ~1s perception. Recommend validating the chosen hardware against the worst realistic lighting/label condition during the pilot, not just in the lab. Standardise on one symbology if production allows, to simplify validation.

### 2.4 Observability from day one
Structured logs, metrics on the validation latency distribution (p50/p95/p99, not just the 1s median), exception-rate dashboards per warehouse, and integration-batch success rates. The exception rate per warehouse is itself a **business KPI** (it surfaces process problems on the floor), not just an ops metric.

## 3. Process & Data Quality

### 3.1 Opening-stock reconciliation is the make-or-break (OI-10)
The hardest part isn't the software — it's the *existing* discrepancy IDM is meant to fix. If go-live seeds bad opening balances, IDM will generate a flood of false exceptions and lose user trust in week one. Recommend a **physical stock-take at each warehouse during cutover** where feasible, a per-warehouse variance acceptance threshold agreed with finance, and treating opening discrepancies as logged exceptions to be worked down — not silently absorbed.

### 3.2 Exception-rate as a managed metric with feedback to the floor
Set a target exception rate, monitor the trend per warehouse, and feed it back to warehouse managers. A persistently high WRONG_WAREHOUSE or SHORT rate at one site points to a process or labelling issue upstream — IDM's data becomes a continuous-improvement tool, not just a record.

### 3.3 Phased rollout with a "golden warehouse"
Beyond the pilot, designate the best-performing pilot warehouse as a reference site; new warehouses train against its data and process. This shortens the learning curve across 27 sites.

### 3.4 Reconciliation report as a standing artifact
The post-go-live SAP↔IDM variance report (AC-11) should be a scheduled, trended report, not a one-off acceptance check — it's the ongoing proof that the core problem stays solved.

## 4. Scalability & Future

- **Phase 3 read APIs first.** Expose IDM as versioned, scoped, read-only APIs (serial status, transaction history, stock-by-warehouse) for SFA/DMS — lower risk than write integration and matches the consumer relationship.
- **Partitioning the event ledger.** As `serial_event` grows (every serial × every movement across 31 sites), plan time- or warehouse-based partitioning and an archival policy aligned to the compliance retention requirement.
- **Analytics extension.** With a clean serial ledger, downstream analytics (dead-stock detection, dispatch-accuracy trends, return-rate by product/segment) become low-effort additions that materially help inventory and quality decisions.

## 5. Quick-Win Recommendations (low effort, high value)

| Recommendation | Effort | Value |
|----------------|--------|-------|
| Bake `integration_batch` idempotency + replay console in Sprint 0–1 | Low | High (resilience, support time) |
| Event-sourced `serial_event` as authoritative ledger | Low (design choice now) | High (audit, history, replay) |
| Latency dashboards (p95/p99) on validation from first build | Low | High (protects AC-6) |
| Agree opening-stock variance threshold with finance before pilot | Low | Critical (trust at go-live) |
| Define the IDM↔DMS serial-ownership contract early | Medium | High (de-risks Phase 3) |

---

*Suggestions, not commitments. Adopting any of these beyond the agreed scope is handled through the change-management process in the SOW.*
