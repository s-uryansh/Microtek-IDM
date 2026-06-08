# Data Seeding Strategy — Microtek IDM

**Purpose:** populate every IDM module/page with enough realistic data to drive a credible **live demo** and to exercise edge cases (mismatched serials, exceptions, partial dispatch, expired/returned stock).
**Principle:** seed a small, *internally consistent* world — the same serials flow through production → dispatch → GRN → dispatch → return — so demoing one screen makes the others light up coherently.
**Form:** an idempotent, environment-flagged seed script (re-runnable; refuses to run against production). Seed in dependency order: reference data → serials/events → transactional docs → exceptions.

> All seed records use an obvious marker (e.g., `created_by = 'SEED'`, codes prefixed `DEMO-`) so demo data is trivially identifiable and purgeable.

---

## 1. Reference / Master Seed (shared by all modules)

| Entity | Seed | Notes |
|--------|------|-------|
| `warehouse` | 1 plant (`PLNT-01`), 1 central (`CW-01`), 3 regional (`RW-01/02/03`) | Mirrors the pilot footprint. |
| `product` | ~8 SKUs across segments incl. ≥2 batteries (`is_battery = TRUE`) and 1 inactive SKU | Inactive SKU drives a negative test. |
| `app_user` / `role` | 1 warehouse operator per WH, 1 supervisor, 1 admin | Exercises RBAC + exception-correction permission (OI-9). |

## 2. Per-Module Seed Plans

### IDM-01 — SAP → IDM Production & Dispatch Import (page: Import status / serial master)
- ~500 production serials across the 8 SKUs and the plant.
- ~10 factory-dispatch documents (`sap_dispatch_doc`) routing serials PLNT-01 → CW-01 and CW-01 → RW-01/02/03, each with serial-to-invoice mapping.
- 3 `integration_batch` rows: 2 `PROCESSED`, **1 `FAILED`** (to demo replay/idempotency).
- **Edge cases:** one dispatch doc containing a serial that is *also* (deliberately) duplicated in another doc → seeds a future GRN conflict.

### IDM-02 — Scan-based GRN (page: GRN list + GRN detail/reconciliation)
Seed GRNs at CW-01 and RW-01 against the imported dispatch docs, covering all `match_status` outcomes:
- **MATCHED** — a clean GRN where scanned serials == dispatch doc (happy path).
- **SHORT** — dispatch doc lists 50, only 47 scanned → 3 short-ship exceptions.
- **EXCESS** — a scanned serial not on the dispatch doc → excess exception.
- **WRONG_SERIAL** — a serial belonging to a different destination warehouse → wrong-serial exception.
- One **in-progress** GRN (partially scanned) to show resumability.

### IDM-03 — Battery Pre-Billing Scan (page: battery billing gate)
- 2 battery invoices in `READY_TO_SCAN` state with required serials known.
- 1 invoice **fully scanned & committed** (gate passed → billing allowed).
- 1 invoice **partially scanned** (gate blocked → billing prevented) — the key demo of the workflow gate.
- **Edge case:** an attempt to commit a non-battery serial to a battery invoice → product-mismatch exception.

### IDM-04 — Sales Return Note / SRN (page: SRN list + create)
- 2 completed SRNs whose serials reconcile to an earlier customer dispatch (happy path), with condition tags (per OI-3 taxonomy: saleable/defective) once confirmed.
- 1 SRN attempt scanning a serial with **no matching original dispatch** → validation failure/exception.
- 1 SRN scanning an **already-returned** serial → duplicate-return exception.

### IDM-05 — Warehouse Dispatch with Serial Scan (page: dispatch / scan-against-invoice)
- 3 dispatch orders at RW-01 mapped to SAP invoices: 1 **fully dispatched**, 1 **in-progress**, 1 **not started**.
- Demonstrate physically scanned serials **replacing** SAP-suggested serials on the invoice (seed both the SAP-suggested set and a differing scanned set).
- **Edge cases:** scanning a serial **already dispatched** elsewhere; scanning a serial belonging to **another warehouse**; scanning an **unknown** serial → each raises the matching exception rule.

### IDM-06 — Real-Time Validation + Exception Log (page: exception list)
Because the modules above seed failures, the exception log naturally fills. Ensure coverage of **every rule_code** at least once:
- `ALREADY_DISPATCHED`, `WRONG_WAREHOUSE`, `NOT_FOUND`, `PRODUCT_INVOICE_MISMATCH`, plus GRN `SHORT`/`EXCESS`/`WRONG_SERIAL`.
- Mix of `OPEN` (most), a few `CORRECTED`, and one `DISMISSED` so the list shows all states.

### IDM-07 — Order Fulfilment Status (page: order status board)
- Orders in each status: **Dispatched** (all lines scanned), **Partial** (some lines — pending OI-4 confirmation of resumability), **Pending** (none scanned).
- Counts that visibly tie back to the IDM-05 dispatch seed.

### IDM-08 — Inventory Ageing Report (page: portal ageing report)
- Backdate `received_at` across in-stock serials to populate **every ageing bucket** (e.g., 0–30 / 31–60 / 61–90 / >90 — final buckets per OI-8): some fresh, some 45 days, some 75, several >90 (aged stock).
- Spread aged stock across RW-01/02/03 so warehouse filters are meaningful.
- **Edge case:** one in-stock serial with a missing/null `received_at` to demonstrate the data-quality flag (validation rule from the SQL Plan).

### IDM-09 — Serial Transaction History (page: serial lookup)
- Designate **2–3 "hero" serials** that traverse the full lifecycle: production → factory dispatch → GRN → inter-warehouse transfer → customer dispatch → SRN → an exception + its correction. These are the serials the demo presenter types in — they produce a rich, ordered event chain from `serial_event`.

### IDM-10 — Exception Correction (page: exception correction)
- Leave several IDM-06 exceptions `OPEN` and pre-seed 2 as `CORRECTED` (with corrective txn ref, mandatory reason, corrector identity, timestamp) so the audit display is populated before anyone clicks.
- Ensure at least one OPEN exception is correctable live during the demo by the supervisor account, and that a non-authorised operator account is **blocked** (RBAC demo).

### IDM-11 — SFA/DMS (out of scope) 
- No functional seed; optionally a stub showing the planned read-API payload shape (serial status, history, stock-by-warehouse) for roadmap conversations.

## 3. Cross-Module Consistency Rules (so the demo "hangs together")

1. Serials seeded in IDM-01 are the **only** serials referenced everywhere else — no floating IDs.
2. The hero serials (IDM-09) are deliberately the ones routed through a GRN discrepancy (IDM-02), a dispatch (IDM-05), a return (IDM-04), and a correction (IDM-10).
3. Ageing buckets (IDM-08) are derived from the *same* `received_at` values written by the seeded GRNs, not invented independently.
4. Every seeded exception has a real originating transaction — no orphan exceptions.

## 4. Volume & Safety

- Demo volume is intentionally small (~500 serials) for clarity. A **separate load-seed profile** (parameterised count, e.g., 100k+ serials, concurrent-scan simulation) is used for performance testing in Sprint 6 against the AC-6 latency target — sized once OI-5/OI-6 are known.
- The seed script: (a) checks an explicit `ENV != production` guard, (b) is idempotent (upsert on natural keys), (c) tags all rows `SEED`/`DEMO-`, and (d) ships with a matching teardown that removes only tagged rows.

---

*Seed data is illustrative and contains no real customer PII. Confirm OI-3 (return condition tags) and OI-8 (ageing buckets) before finalising the seed values, as they change the IDM-04 and IDM-08 datasets.*
