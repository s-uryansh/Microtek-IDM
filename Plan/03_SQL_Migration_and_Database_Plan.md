# SQL Migration & Database Plan — Microtek IDM

**Database:** separate, Basiq360-managed IDM database (TEC-DB) — **not** shared with SAP.
**Scope:** schema to support IDM-01…IDM-10; SAP remains the ERP system of record, IDM is the **physical-serial** system of record.
**Conventions:** snake_case; surrogate `BIGINT` PKs; every transactional table carries `created_at`, `created_by`, `updated_at`, `updated_by`; soft-delete via `is_active` where deletion must be reversible; all timestamps stored UTC.

> SQL below is written in ANSI-leaning syntax (PostgreSQL dialect shown). Adapt types if the chosen platform is SQL Server/MySQL/Oracle (confirm during Sprint 0). Treat this as schema v1 to be ratified at design freeze.

---

## 1. Logical Model (entities)

| Entity | Purpose | Feeds |
|--------|---------|-------|
| `warehouse` | Plants, central & regional warehouses | all |
| `product` | Product/SKU metadata incl. segment (battery flag) | IDM-01, IDM-03 |
| `serial_master` | One row per physical serial; current status & location | IDM-01, IDM-06 |
| `sap_dispatch_doc` / `sap_dispatch_line` | Imported factory/inter-WH dispatch documents and their serial lines | IDM-01, IDM-02 |
| `invoice` / `invoice_line` | SAP invoices and committed serials | IDM-03, IDM-05, IDM-07 |
| `grn` / `grn_scan` | Goods receipt header + scanned serials | IDM-02 |
| `srn` / `srn_scan` | Sales return header + scanned serials | IDM-04 |
| `dispatch` / `dispatch_scan` | Outbound dispatch header + scanned serials | IDM-05, IDM-07 |
| `serial_event` | Append-only event log per serial (the spine of IDM-09) | all |
| `exception_log` | Validation/reconciliation exceptions + corrections | IDM-06, IDM-10 |
| `app_user` / `role` / `role_permission` | RBAC | TEC-AUTH |
| `integration_batch` | Inbound/outbound SAP batch tracking (idempotency/replay) | TEC-INT |

## 2. Core Schema (DDL — illustrative)

```sql
-- Reference: warehouses
CREATE TABLE warehouse (
    warehouse_id   BIGSERIAL PRIMARY KEY,
    code           VARCHAR(20)  NOT NULL UNIQUE,
    name           VARCHAR(120) NOT NULL,
    type           VARCHAR(20)  NOT NULL CHECK (type IN ('PLANT','CENTRAL','REGIONAL')),
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by     VARCHAR(60)  NOT NULL
);

-- Reference: products
CREATE TABLE product (
    product_id     BIGSERIAL PRIMARY KEY,
    product_code   VARCHAR(40)  NOT NULL UNIQUE,
    name           VARCHAR(160) NOT NULL,
    segment        VARCHAR(40)  NOT NULL,             -- e.g. 'BATTERY','INVERTER'
    is_battery     BOOLEAN      NOT NULL DEFAULT FALSE, -- drives IDM-03 pre-billing gate
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by     VARCHAR(60)  NOT NULL
);

-- Serial master: physical system of record
CREATE TABLE serial_master (
    serial_id          BIGSERIAL PRIMARY KEY,
    serial_no          VARCHAR(80)  NOT NULL UNIQUE,
    product_id         BIGINT       NOT NULL REFERENCES product(product_id),
    batch_no           VARCHAR(60),
    current_status     VARCHAR(24)  NOT NULL DEFAULT 'PRODUCED'
                       CHECK (current_status IN
                         ('PRODUCED','IN_TRANSIT','IN_STOCK','DISPATCHED','RETURNED','EXCEPTION')),
    current_warehouse_id BIGINT     REFERENCES warehouse(warehouse_id),
    received_at        TIMESTAMPTZ,                    -- receipt date for ageing (IDM-08)
    source_invoice_ref VARCHAR(60),
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by         VARCHAR(60)  NOT NULL,
    updated_at         TIMESTAMPTZ,
    updated_by         VARCHAR(60)
);
CREATE INDEX ix_serial_status_wh ON serial_master(current_status, current_warehouse_id);
CREATE INDEX ix_serial_product    ON serial_master(product_id);

-- Append-only event log — spine of serial history (IDM-09)
CREATE TABLE serial_event (
    event_id       BIGSERIAL PRIMARY KEY,
    serial_id      BIGINT      NOT NULL REFERENCES serial_master(serial_id),
    event_type     VARCHAR(30) NOT NULL              -- PRODUCTION, FACTORY_DISPATCH, GRN,
                                                     -- TRANSFER, CUSTOMER_DISPATCH, SRN, EXCEPTION
                   CHECK (event_type IN ('PRODUCTION','FACTORY_DISPATCH','GRN','TRANSFER',
                                         'CUSTOMER_DISPATCH','SRN','EXCEPTION','CORRECTION')),
    warehouse_id   BIGINT      REFERENCES warehouse(warehouse_id),
    reference_type VARCHAR(20),                       -- 'GRN','SRN','DISPATCH','INVOICE'
    reference_id   BIGINT,
    event_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     VARCHAR(60) NOT NULL
);
CREATE INDEX ix_event_serial_time ON serial_event(serial_id, event_at);

-- Exception + correction (IDM-06 raises, IDM-10 corrects)
CREATE TABLE exception_log (
    exception_id   BIGSERIAL PRIMARY KEY,
    serial_no      VARCHAR(80),                       -- nullable: serial may not exist
    rule_code      VARCHAR(40) NOT NULL,              -- ALREADY_DISPATCHED, WRONG_WAREHOUSE,
                                                     -- NOT_FOUND, PRODUCT_INVOICE_MISMATCH ...
    context_type   VARCHAR(20) NOT NULL,              -- GRN/DISPATCH/SRN/BATTERY
    context_id     BIGINT,
    status         VARCHAR(16) NOT NULL DEFAULT 'OPEN'
                   CHECK (status IN ('OPEN','CORRECTED','DISMISSED')),
    raised_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    raised_by      VARCHAR(60) NOT NULL,
    -- correction fields (IDM-10)
    corrected_at   TIMESTAMPTZ,
    corrected_by   VARCHAR(60),
    correction_reason TEXT,
    correction_txn_ref VARCHAR(60)
);
CREATE INDEX ix_exception_status ON exception_log(status, raised_at);

-- SAP integration batch tracking (idempotency / replay)
CREATE TABLE integration_batch (
    batch_id       BIGSERIAL PRIMARY KEY,
    direction      VARCHAR(10) NOT NULL CHECK (direction IN ('INBOUND','OUTBOUND')),
    payload_type   VARCHAR(30) NOT NULL,              -- PRODUCTION, DISPATCH, INVOICE,
                                                     -- CONFIRMED_SERIALS, AGEING
    external_ref   VARCHAR(80),
    record_count   INTEGER,
    status         VARCHAR(16) NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING','PROCESSED','FAILED','REPLAYED')),
    started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at    TIMESTAMPTZ,
    error_detail   TEXT,
    UNIQUE (direction, payload_type, external_ref)    -- dedupe / idempotency key
);
```

Header/line tables for `grn`, `srn`, `dispatch`, `invoice`, `sap_dispatch_doc` follow the same pattern: a header with warehouse + reference + status, and a `_line`/`_scan` child carrying `serial_id`, a `match_status` (`MATCHED`/`SHORT`/`EXCESS`/`WRONG_SERIAL`), and audit columns. RBAC tables (`app_user`, `role`, `role_permission`) implement OI-9.

## 3. Migration Strategy

Migrations are **versioned and forward-only in production** (e.g., Flyway/Liquibase/`V###__description.sql`). Each migration is paired with a tested rollback (Section 5) for use only up to the point of go-live cutover.

| Wave | Migration content | Tied to sprint |
|------|-------------------|----------------|
| V001 | Reference tables (`warehouse`, `product`), RBAC | Sprint 0 |
| V002 | `serial_master`, `serial_event`, `integration_batch` | Sprint 1 (IDM-01, IDM-06) |
| V003 | `invoice`/`invoice_line`, `dispatch`/`dispatch_scan` | Sprint 2 (IDM-05, IDM-07) |
| V004 | Ageing materialised view / report objects | Sprint 3 (IDM-08) |
| V005 | `sap_dispatch_doc`/`_line`, `grn`/`grn_scan` | Sprint 4 (IDM-02), IDM-03 flags |
| V006 | `srn`/`srn_scan`, `exception_log` correction columns | Sprint 5 (IDM-04, IDM-10) |
| V007 | History report indexes/views, performance tuning | Sprint 6 (IDM-09) |

### Data migration / go-live cutover (OI-10)
Microtek's central problem is the **existing opening-stock discrepancy** between SAP and physical reality. The cutover per warehouse:
1. **Freeze** inventory movement during a short blackout window.
2. **Seed** `serial_master` from the agreed source — SAP open stock for that warehouse, supplemented by a physical stock-take if available — setting `current_status = 'IN_STOCK'`, `received_at` = best-known receipt date (or cutover date as a documented fallback), and writing a `PRODUCTION`/`GRN` `serial_event` so history starts from a known baseline.
3. **Reconcile**: produce a variance report (SAP qty vs. seeded serials); known discrepancies are logged as opening exceptions, not silent corrections.
4. **Go live**; resume movements through IDM only.

This is staged per warehouse (pilot first) rather than big-bang, so the variance threshold (AC-11) can be validated incrementally.

## 4. Validation Steps (per migration & per data load)

Run after every migration wave and after each SAP import batch:

- **Schema validation:** all migrations applied in order; no failed/partial migration; FK and CHECK constraints present; expected indexes exist.
- **Referential integrity:** zero orphaned `serial_master.product_id`; zero `serial_event` rows pointing at a missing serial; zero `invoice_line`/`dispatch_scan` rows with unknown `serial_id`.
- **Uniqueness:** `serial_no` unique in `serial_master`; `integration_batch` idempotency key unique (no duplicate import processing).
- **Reconciliation:** count and sum checks of imported records vs. `integration_batch.record_count`; SAP-stock vs. IDM-serial variance report within agreed tolerance.
- **Ageing sanity:** every `IN_STOCK` serial has a non-null `received_at`; ageing buckets sum to total on-hand.
- **History completeness:** for a sampled serial, `serial_event` reproduces the expected lifecycle in order (supports AC-9).
- **Smoke transactions:** one scripted GRN, dispatch, SRN, and exception-correction execute end-to-end on the migrated schema.

```sql
-- Example validation queries
-- Orphaned serials
SELECT COUNT(*) FROM serial_master s
LEFT JOIN product p ON p.product_id = s.product_id
WHERE p.product_id IS NULL;            -- expect 0

-- In-stock serials missing a receipt date (breaks ageing IDM-08)
SELECT COUNT(*) FROM serial_master
WHERE current_status = 'IN_STOCK' AND received_at IS NULL;  -- expect 0

-- Duplicate inbound batch processing (idempotency breach)
SELECT direction, payload_type, external_ref, COUNT(*)
FROM integration_batch
GROUP BY direction, payload_type, external_ref HAVING COUNT(*) > 1;  -- expect none
```

## 5. Rollback Procedures

- **Pre-go-live (schema):** every migration `V###` ships with a paired `U###` (down) script that drops new objects / reverts column changes in reverse dependency order. Rollback is validated in CI against a seeded database before the forward migration is approved.
- **Production posture:** once a warehouse is live, schema rollback is **forbidden**; corrections go forward via a new migration (data is real and append-only). This is why `serial_event` and `exception_log` are append-only — we never mutate history.
- **Data-load rollback:** a failed SAP import batch is contained by `integration_batch` status. Because loads are idempotent and batch-scoped, a `FAILED` batch is rolled back by deleting rows tagged with that `batch_id` (loads stamp inserted rows with the originating batch), then `REPLAYED` after the source file/payload is corrected — analogous to the DMS "FTP Manual Hit" re-pull.
- **Cutover rollback:** if a warehouse cutover fails validation (variance beyond threshold), abort before resuming movements: restore the pre-cutover snapshot of `serial_master`/`serial_event` for that warehouse, keep SAP as the live record, and reschedule. Each cutover therefore takes a per-warehouse logical snapshot immediately before step 2.
- **Backups:** full nightly + transaction-log/PITR backups so any wave can be recovered to a point in time independent of the migration tooling.
