# Statement of Work (SOW)
## Basiq360 Inventory & Dispatch Management (IDM) for Microtek

| | |
|---|---|
| **Client** | Microtek |
| **Vendor** | Basiq360 |
| **Solution** | IDM — serial-level inventory tracking layer, bidirectionally integrated with SAP |
| **Document status** | Draft v0.1 — pending client confirmation of open items |
| **Date** | June 2026 |

---

## 1. Project Objectives

Microtek serialises every unit at the point of production, but serial-level traceability breaks down across the supply chain because (a) no serial scan is performed at goods receipt, and (b) at customer dispatch the serials SAP suggests differ from the serials physically shipped. The result is a persistent disconnect between SAP inventory records and physical stock, an inability to produce accurate inventory-ageing reports, and weak auditability.

The IDM solution will establish a **physical-serial system of record** that sits alongside SAP and reconciles to it. The objectives are to:

1. Capture the actual physical serial number at every inventory node — goods receipt, warehouse dispatch, customer return, and (for batteries) pre-billing.
2. Replace SAP-suggested dispatch serials with physically scanned serials, eliminating the SAP-vs-physical mismatch at the dispatch leg.
3. Validate every scanned serial in real time and log every exception for review and correction.
4. Provide accurate, serial-level inventory-ageing and full serial transaction-history reporting via an IDM web portal, and feed inventory-age data back to SAP for a customised SAP-side ageing report.
5. Deliver the above across 2 plants, 2 central warehouses, and 27 regional warehouses, rolled out in controlled phases.

## 2. Scope of Work

### 2.1 In Scope

The following functional modules are in scope. IDs are used consistently across all project documents.

| ID | Module | Classification |
|----|--------|----------------|
| IDM-01 | SAP → IDM production & factory-dispatch data import (serials, product metadata, destination warehouse, invoice/GRN references) | Agreed |
| IDM-02 | Scan-based GRN at Central & Regional warehouses, reconciled against the sender's dispatch document | New requirement |
| IDM-03 | Battery-segment mandatory serial scan **before** billing, committing serials to the invoice | New requirement |
| IDM-04 | Sales Return Note (SRN) creation by scanning returned serials, validated against original dispatch | New requirement |
| IDM-05 | Warehouse dispatch with mandatory per-item serial scan, mapped to the SAP invoice | Agreed |
| IDM-06 | Real-time serial validation (~1s) with exception logging | Agreed |
| IDM-07 | Order fulfilment status marking (Dispatched / partial) | Agreed |
| IDM-08 | Inventory-ageing report on the IDM portal **and** a customised SAP-side ageing report fed by IDM | Agreed (customisation) |
| IDM-09 | Serial-number transaction-history report (full event chain) | New requirement |
| IDM-10 | Exception correction via the IDM web portal (corrective posting + reason, fully audited) | Agreed |

Cross-cutting technical components also in scope: the IDM mobile app (TEC-APP), web portal (TEC-WEB), a separate Basiq360-managed database (TEC-DB), the SAP bidirectional integration layer (TEC-INT), authentication and role-based access control (TEC-AUTH), and logging/monitoring/audit infrastructure (TEC-OBS).

### 2.2 Out of Scope (current phase)

- IDM-11 — Integration with SFA (Sales Force Automation) and DMS (Dealer Management System). Reserved for Phase 3; only the API-exposure approach is in scope to design at a high level.
- Any change to SAP configuration or SAP business logic beyond the agreed integration touchpoints.
- Procurement of scanning hardware.
- Changes to existing ERP/DMS workflows beyond the defined integration points. (Note: Microtek's existing DMS already performs QR/coupon serial scanning at distributor dispatch and integrates with SAP/EWMS; IDM must align to, not duplicate, that serial model — see the Implementation Plan and Research sections.)

## 3. Deliverables

| # | Deliverable | Acceptance Owner |
|---|-------------|------------------|
| D1 | Discovery & requirements specification with all open items (OI-1…OI-11) resolved | Client + Basiq360 |
| D2 | Solution & integration architecture document (SAP touchpoints, data contracts, sequence diagrams) | Client SAP team + Basiq360 |
| D3 | IDM database schema + migration scripts (see SQL Migration & Database Plan) | Basiq360 DBA |
| D4 | IDM mobile app (GRN, dispatch, SRN, battery pre-billing scanning) | Client warehouse ops |
| D5 | IDM web portal (ageing report, serial history report, exception management, configuration) | Client supervisors/managers |
| D6 | SAP bidirectional integration (inbound import + outbound ageing/confirmed-serials) | Client SAP team |
| D7 | Pilot deployment at selected warehouses (per OI-11) | Client |
| D8 | UAT sign-off pack (test cases executed, defects closed) | Client QA |
| D9 | Production rollout to all 27 regional warehouses | Client |
| D10 | Operations runbook, admin guide, and training material | Client ops + admin |

## 4. Acceptance Criteria

Acceptance is granted per deliverable against the criteria below; criteria reference the feature IDs they validate. Full condition→outcome detail is in the Test Case Suite.

| Criterion | Target | Validates |
|-----------|--------|-----------|
| AC-1 | SAP production & dispatch records import into IDM with 100% field-level fidelity on a reconciled sample; no orphaned serials. | IDM-01 |
| AC-2 | Scan-based GRN records physical serials and flags every short-ship / excess / wrong-serial against the dispatch document. | IDM-02 |
| AC-3 | Battery billing is blocked until all required serials are scanned and committed to the invoice. | IDM-03 |
| AC-4 | SRN accepts only serials that reconcile to an original dispatch; mismatches are flagged. | IDM-04 |
| AC-5 | Dispatch requires a physical scan per item; the dispatched serial set replaces SAP-suggested serials on the invoice. | IDM-05 |
| AC-6 | Median real-time validation response ≤ 1s; every failed validation raises an immediate app alert **and** a persisted exception record. | IDM-06 |
| AC-7 | An order is marked "Dispatched" only when all invoice lines are scanned; partial behaviour matches the confirmed rule (OI-4). | IDM-07 |
| AC-8 | Portal ageing report and SAP custom report agree to the same serial-level receipt dates within the agreed tolerance. | IDM-08 |
| AC-9 | Serial history returns the complete, chronologically ordered event chain (production → dispatch → GRN → transfers → customer dispatch → SRN → exceptions). | IDM-09 |
| AC-10 | Exception correction posts a corrective transaction with mandatory reason; the original and correction are both retained and audit-attributed. | IDM-10 |
| AC-11 | Reconciliation report shows SAP and IDM physical inventory converging within the agreed variance threshold after go-live. | Overall objective |

A deliverable is accepted when its mapped criteria pass in UAT and all Severity-1/Severity-2 defects are closed.

## 5. Delivery Timeline (indicative)

This timeline assumes open items OI-1…OI-11 are closed within the Discovery window. Calendar dates are set at contract signature; durations below are working-week estimates.

| Phase | Window | Key activities | Exit gate |
|-------|--------|----------------|-----------|
| Phase 0 — Discovery | Weeks 1–2 | Close OI-1…OI-11, finalise data contracts, design freeze (D1, D2) | Signed requirements + architecture |
| Phase 1 — Pilot build | Weeks 3–8 | IDM-01, IDM-05, IDM-06, IDM-08; mobile + portal skeleton; SAP inbound/outbound MVP (D3–D6) | Pilot-ready build |
| Phase 1 — Pilot run | Weeks 9–12 | Deploy to 1 central + 2–3 regional WHs; opening-stock reconciliation (OI-10); pilot UAT (D7, D8) | Pilot sign-off |
| Phase 2 — Rollout build | Weeks 13–18 | IDM-02, IDM-03, IDM-04, IDM-07, IDM-09, IDM-10; hardening | Rollout-ready build |
| Phase 2 — Rollout | Weeks 19–22 | Phased deployment across all 27 regional WHs; training (D9, D10) | Production sign-off |
| Phase 3 — Integration | Post go-live | IDM-11 (SFA/DMS APIs) | Separate SOW/change request |

## 6. Assumptions & Dependencies

- The client closes all open items in the Discovery window; unresolved items become a schedule risk and may trigger a change request.
- The client's SAP team provides a non-production SAP environment, the agreed integration mechanism (OI-7), and test data for IDM-01.
- Scanning hardware (OI-1) is procured by the client and made available before pilot UAT.
- Network connectivity at warehouses (OI-2) meets the requirement for the chosen architecture (online vs. offline-sync).
- Opening-stock reconciliation strategy (OI-10) is agreed before each warehouse goes live.

## 7. Change Management

Any change to scope, the open-item resolutions that materially affect design, or the timeline is handled through a written change request, impact-assessed by Basiq360, and approved by the client before work proceeds. SFA/DMS integration (IDM-11) is explicitly handled as a Phase 3 change request or separate SOW.

---

*Prepared by Basiq360 for internal review. Confirm open items before circulating to the client.*
