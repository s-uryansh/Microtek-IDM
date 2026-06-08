# Implementation Plan — Microtek IDM

**Companion to:** Statement of Work, PROGRESS.md, SQL Migration Plan, Test Case Suite
**Sprint length:** 2 weeks (assumed; adjust to team cadence)
**Feature IDs** map 1:1 to the SOW and PROGRESS tracker.

---

## 1. Roadmap Overview

The build follows the SOW's three-phase structure. The sequencing principle is **integration-first, validation-as-a-shared-service, then node-by-node scanning**: nothing meaningful can be tested until SAP production/dispatch data is flowing into IDM (IDM-01) and the real-time validation service (IDM-06) exists, because every scanning workflow depends on both.

```
Discovery ──> Sprint 1 ──> Sprint 2 ──> Sprint 3 ──> [Pilot UAT]
                IDM-01      IDM-05       IDM-08        Phase 1 sign-off
                IDM-06      IDM-07
                TEC-*       

            ──> Sprint 4 ──> Sprint 5 ──> Sprint 6 ──> [Rollout UAT] ──> Phase 3
                IDM-02       IDM-04       IDM-09         27 WH rollout    IDM-11
                IDM-03       IDM-10       hardening
```

## 2. Sprint Breakdown

### Sprint 0 — Discovery & Foundations (Phase 0)
- Resolve open items OI-1…OI-11; design freeze.
- Stand up environments, CI/CD, the separate IDM database (TEC-DB), auth/RBAC skeleton (TEC-AUTH), and logging/audit base (TEC-OBS).
- Agree SAP data contracts and the integration mechanism (OI-7) with the client SAP team.
- **Exit:** signed requirements + architecture; schema v1 (see SQL Migration Plan) reviewed.

### Sprint 1 — Inbound Integration + Validation Core (Phase 1 build)
- **IDM-01** SAP→IDM production & factory-dispatch import (the foundation dataset).
- **IDM-06** Real-time serial validation service with exception logging — built as a standalone service consumed by all later scanning flows.
- TEC-INT inbound pipeline; TEC-APP and TEC-WEB skeletons.
- **Exit:** serials queryable in IDM; validation service returns pass/fail + exception record under target latency on test data.

### Sprint 2 — Dispatch + Fulfilment (Phase 1 build)
- **IDM-05** Warehouse dispatch with per-item serial scan; dispatched serials replace SAP-suggested serials and map to the SAP invoice (TEC-INT outbound: confirmed serials).
- **IDM-07** Order fulfilment status marking, with partial behaviour per OI-4.
- **Exit:** an order can be scanned, dispatched, marked Dispatched, and the confirmed-serial payload posts back toward SAP.

### Sprint 3 — Ageing + Pilot Readiness (Phase 1 build)
- **IDM-08** Inventory-ageing report on the portal + outbound feed for the customised SAP ageing report (buckets/format per OI-8).
- Opening-stock reconciliation tooling for go-live (OI-10).
- Pilot deployment to 1 central + 2–3 regional warehouses (OI-11).
- **Exit:** Pilot UAT; Phase 1 sign-off (AC-1, AC-5, AC-6, AC-7, AC-8, AC-11 on pilot data).

### Sprint 4 — Inward Scanning + Battery Gate (Phase 2 build)
- **IDM-02** Scan-based GRN at Central & Regional warehouses, reconciled against the sender's dispatch document; exceptions logged.
- **IDM-03** Battery-segment pre-billing scan committing serials to the invoice before SAP billing.
- **Exit:** GRN and battery flows pass condition→outcome tests including short-ship/excess/wrong-serial.

### Sprint 5 — Returns + Exception Management (Phase 2 build)
- **IDM-04** SRN — returns scanned and validated against original dispatch; condition tagging per OI-3.
- **IDM-10** Exception correction via web portal (corrective posting + mandatory reason, fully audited; roles per OI-9).
- **Exit:** returns reconcile to dispatch; authorised users can correct any logged exception with full audit attribution.

### Sprint 6 — Serial History + Hardening (Phase 2 build)
- **IDM-09** Serial-number transaction-history report — complete chronological event chain.
- Performance hardening for concurrent multi-warehouse scanning (sizing from OI-5, OI-6); security remediation from the Security Audit; data-migration dry runs.
- **Exit:** Rollout UAT; production sign-off; phased rollout across all 27 regional warehouses (D9).

### Phase 3 — Integration Expansion
- **IDM-11** Expose IDM data to SFA/DMS via versioned APIs. Handled as a separate SOW / change request after go-live stabilises.

## 3. Dependency Map

| Feature | Hard dependencies | Why |
|---------|-------------------|-----|
| IDM-01 | OI-7 (SAP mechanism), TEC-DB, TEC-INT | Cannot import without the contract and a target schema. |
| IDM-06 | IDM-01, TEC-DB | Validation queries the serial master populated by IDM-01. |
| IDM-05 | IDM-01, IDM-06, TEC-APP, TEC-INT (outbound) | Dispatch scans validate against the master and post confirmed serials back to SAP. |
| IDM-07 | IDM-05, OI-4 | Fulfilment status is derived from completed dispatch scanning. |
| IDM-08 | IDM-02 (receipt date per serial), IDM-01, OI-8, TEC-INT (outbound) | Ageing needs a reliable receipt timestamp; pilot can bootstrap from IDM-01 dispatch dates until IDM-02 lands. |
| IDM-02 | IDM-01, IDM-06, TEC-APP, OI-1, OI-2 | GRN reconciles scanned serials to the imported dispatch doc; needs hardware + connectivity decisions. |
| IDM-03 | IDM-06, TEC-APP, TEC-INT | Pre-billing gate must validate and commit before SAP billing fires. |
| IDM-04 | IDM-01/IDM-05 (dispatch record), IDM-06, OI-3 | Returns validate against the original dispatch and need a condition taxonomy. |
| IDM-09 | IDM-01, IDM-02, IDM-04, IDM-05, IDM-10 | History is only complete once every event-producing module writes to the event log. |
| IDM-10 | IDM-06 (exception records), OI-9 | Corrections act on logged exceptions and need a role hierarchy. |
| IDM-11 | All of the above stable | Exposes consolidated IDM data externally. |

## 4. SAP Integration — Critical-Path Detail

SAP integration is the project's critical path; almost everything blocks on it. The data flows are:

- **Inbound (SAP → IDM):** production serials with batch/product metadata; factory-dispatch invoices with serial-to-invoice mapping; destination warehouse; invoice creation events.
- **Outbound (IDM → SAP):** confirmed physical dispatch serials (to reconcile SAP inventory, the core mismatch fix); inventory-age data for the customised SAP ageing report.

Key planning points:
1. **Mechanism (OI-7) must close in Sprint 0.** API/BAPI/RFC vs. file/middleware changes the build of TEC-INT materially. The existing Microtek DMS already uses scheduled FTP/CSV exchanges with SAP (orders every 5 min, dispatch-scan sync every ~2 hours via EWMS, outstanding/invoice daily). IDM should reuse a proven pattern unless real-time confirmation is required at dispatch — in which case an API/middleware path is preferable for the IDM-05 outbound leg.
2. **Idempotency and replay.** Both legs must be idempotent (safe re-processing on retry) and carry correlation IDs so a failed batch can be re-pulled — mirroring the existing "FTP Manual Hit" fallback in the DMS.
3. **No SAP business-logic changes** are in scope; IDM reconciles to SAP, it does not reconfigure it.

## 5. SFA / DMS Integration (Phase 3)

Out of scope for the current phases, but the design must not paint us into a corner:
- Persist data in IDM with stable external identifiers (serial, invoice ref, warehouse code) so a later API can expose serial status, movement history, and ageing without schema surgery.
- Plan IDM-11 as **read APIs first** (serial lookup, transaction history, stock-by-warehouse) since SFA/DMS are consumers.
- Coordinate with the existing DMS serial/coupon model so the same physical serial is not represented inconsistently across IDM and DMS — a reconciliation contract between the two is a Phase 3 prerequisite.

## 6. Key Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Open items slip past Discovery | Schedule + rework | Design freeze gate; unresolved OIs convert to change requests. |
| Offline connectivity at remote WHs (OI-2) | Architecture rework | Decide online vs. offline-sync in Sprint 0; if offline, build sync/queue into TEC-APP from the start. |
| Opening-stock discrepancy at go-live (OI-10) | False exceptions, low trust | Reconciliation tooling + a defined cutover/blackout window per warehouse. |
| Concurrent-load unknowns (OI-5, OI-6) | Latency breaches AC-6 | Get volumes early; load-test the validation service in Sprint 6 against worst-case warehouse. |
| Serial-model divergence with existing DMS | Data integrity, Phase 3 blocker | Define a single source of truth for the physical serial; document the IDM↔DMS contract. |
