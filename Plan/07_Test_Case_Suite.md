# Test Case Suite — Microtek IDM

**Format:** `Condition → Expected Outcome`. Each case carries an ID, the feature it validates (`IDM-##`), type (Positive / Negative / Integration-failure), and the acceptance criterion (`AC-#`) it supports.
**Cross-reference:** feature IDs and ACs match the SOW, Implementation Plan, and PROGRESS tracker. Coverage spans every in-scope module (IDM-01…IDM-10).

---

## IDM-01 — SAP → IDM Production & Dispatch Import (AC-1)

| ID | Type | Condition → Expected Outcome |
|----|------|------------------------------|
| T01-01 | Positive | Valid SAP production batch is imported → all serials created in `serial_master` with product/batch metadata; one `PRODUCTION` event per serial; `integration_batch` = PROCESSED with matching record count. |
| T01-02 | Positive | Factory-dispatch doc imported → `sap_dispatch_doc`/lines created with serial-to-invoice and destination-warehouse mapping. |
| T01-03 | Negative | Import payload contains a serial referencing an unknown product → row rejected, error captured, valid rows still processed; rejection visible on import-status page. |
| T01-04 | Negative | Duplicate serial within the same payload → duplicate rejected, original retained, exception/error logged. |
| T01-05 | Integration-failure | SAP source unreachable / payload missing → batch = FAILED, no partial commit, alert raised; **re-pull (replay) reprocesses without creating duplicates** (idempotency key honoured). |
| T01-06 | Integration-failure | Same batch delivered twice → second processing is a no-op (UNIQUE idempotency key); record counts unchanged. |

## IDM-02 — Scan-based GRN (AC-2)

| ID | Type | Condition → Expected Outcome |
|----|------|------------------------------|
| T02-01 | Positive | Scanned serials exactly match the sender's dispatch doc → GRN MATCHED; serials set to IN_STOCK at receiving WH; `received_at` stamped; `GRN` event written. |
| T02-02 | Negative | Fewer serials scanned than dispatched (short shipment) → GRN flags SHORT; one exception per missing serial; GRN still recordable for the received units. |
| T02-03 | Negative | A scanned serial is not on the dispatch doc (excess) → EXCESS exception raised; user alerted. |
| T02-04 | Negative | Scanned serial's destination is a different warehouse → WRONG_SERIAL exception; serial not silently received. |
| T02-05 | Positive | Partially scanned GRN saved and resumed later → prior scans preserved; no double counting on resume. |
| T02-06 | Negative | Re-scan of an already-received serial within the same GRN → blocked/flagged as duplicate scan. |

## IDM-03 — Battery Pre-Billing Scan (AC-3)

| ID | Type | Condition → Expected Outcome |
|----|------|------------------------------|
| T03-01 | Positive | All required battery serials scanned → serials committed to invoice; billing gate passes; billing can proceed in SAP. |
| T03-02 | Negative | Billing attempted before all battery serials are scanned → **blocked**; clear message; no commit to invoice. |
| T03-03 | Negative | A non-battery serial scanned against a battery invoice → PRODUCT_INVOICE_MISMATCH exception; not committed. |
| T03-04 | Negative | Battery serial already committed to another invoice → rejected as already-used. |
| T03-05 | Integration-failure | Commit succeeds in IDM but the SAP billing event fails → state remains consistent (committed-but-unbilled is recoverable); no orphaned/duplicate commit on retry. |

## IDM-04 — SRN / Customer Returns (AC-4)

| ID | Type | Condition → Expected Outcome |
|----|------|------------------------------|
| T04-01 | Positive | Returned serial reconciles to an original customer dispatch → SRN created; stock updated; condition tag recorded (per OI-3); `SRN` event written. |
| T04-02 | Negative | Returned serial has no matching original dispatch → validation fails; exception raised; SRN line not accepted. |
| T04-03 | Negative | Serial already returned (duplicate SRN) → blocked with duplicate-return exception. |
| T04-04 | Positive | SRN completion reconciles back toward SAP → stock figures align after sync. |
| T04-05 | Negative | Return with invalid/empty condition tag (once taxonomy fixed) → submission blocked pending valid tag. |

## IDM-05 — Warehouse Dispatch with Serial Scan (AC-5)

| ID | Type | Condition → Expected Outcome |
|----|------|------------------------------|
| T05-01 | Positive | Each invoice item scanned with a valid in-stock serial → physically scanned serials map to the invoice and **replace** SAP-suggested serials; serials set DISPATCHED; `CUSTOMER_DISPATCH` event written. |
| T05-02 | Negative | Scan a serial already dispatched → ALREADY_DISPATCHED exception; alert; not dispatched again. |
| T05-03 | Negative | Scan a serial belonging to a different warehouse → WRONG_WAREHOUSE exception. |
| T05-04 | Negative | Scan an unknown serial → NOT_FOUND exception. |
| T05-05 | Negative | Scan a serial whose product doesn't match the invoice line → PRODUCT_INVOICE_MISMATCH exception. |
| T05-06 | Integration-failure | Confirmed-serial outbound to SAP fails → dispatch state preserved in IDM; outbound batch FAILED + retryable; no duplicate post on replay. |

## IDM-06 — Real-Time Validation + Exception Logging (AC-6)

| ID | Type | Condition → Expected Outcome |
|----|------|------------------------------|
| T06-01 | Positive | Valid serial scanned in any flow → pass returned; median response ≤ 1s under expected load. |
| T06-02 | Negative | Any validation rule fails → user gets an **immediate** app alert **and** a persisted `exception_log` row (both, not either). |
| T06-03 | Positive | Each rule (ALREADY_DISPATCHED / WRONG_WAREHOUSE / NOT_FOUND / PRODUCT_INVOICE_MISMATCH) triggers correctly on its trigger condition and not otherwise. |
| T06-04 | Performance | Concurrent scanning across multiple warehouses at target volume (OI-5/OI-6) → latency target held; no lost or duplicated validations. |
| T06-05 | Integration-failure | Validation backend dependency degraded → graceful failure message; scan not silently accepted; event recoverable. |

## IDM-07 — Order Fulfilment Status (AC-7)

| ID | Type | Condition → Expected Outcome |
|----|------|------------------------------|
| T07-01 | Positive | All invoice lines scanned & dispatched → order auto-marked "Dispatched"; visible on portal. |
| T07-02 | Positive/Conditional | Some lines scanned (partial), per confirmed OI-4 rule → order shows Partial and is resumable, OR partial is disallowed — test matches the confirmed rule. |
| T07-03 | Negative | No lines scanned → order remains Pending; cannot be marked Dispatched. |
| T07-04 | Positive | Status changes propagate to portal/app view consistently with the dispatch data. |

## IDM-08 — Inventory Ageing Report (AC-8)

| ID | Type | Condition → Expected Outcome |
|----|------|------------------------------|
| T08-01 | Positive | Stock with varied `received_at` → serials fall into correct ageing buckets (per OI-8); bucket totals sum to on-hand. |
| T08-02 | Positive | Portal ageing report and the SAP-side customised report agree on serial-level receipt dates within the agreed tolerance. |
| T08-03 | Negative | In-stock serial missing `received_at` → flagged as a data-quality issue, not silently bucketed. |
| T08-04 | Positive | Warehouse/product filters → report scopes correctly; export format matches OI-8 decision. |
| T08-05 | Integration-failure | Outbound ageing feed to SAP fails → portal report unaffected; SAP feed retryable; no double-feed on replay. |

## IDM-09 — Serial Transaction History (AC-9)

| ID | Type | Condition → Expected Outcome |
|----|------|------------------------------|
| T09-01 | Positive | Query a "hero" serial → full chronological chain returned: production → factory dispatch → GRN → transfer → customer dispatch → SRN → exception/correction. |
| T09-02 | Negative | Query an unknown serial → clear "not found" (no error/leak of internals). |
| T09-02b | Positive | A serial with an exception+correction → both the original event and the correction appear, correctly ordered and attributed. |
| T09-03 | Positive | Events render in strict time order even when ingested out of order. |

## IDM-10 — Exception Correction via Web Portal (AC-10)

| ID | Type | Condition → Expected Outcome |
|----|------|------------------------------|
| T10-01 | Positive | Authorised user posts a correction with a reason → corrective transaction recorded; exception → CORRECTED; original + correction both retained; user + timestamp attributed. |
| T10-02 | Negative | Correction submitted **without** a reason → blocked (reason mandatory). |
| T10-03 | Negative (security) | Non-authorised user attempts correction → denied by RBAC (ties to Security S-2); attempt logged. |
| T10-04 | Positive | Corrected exception appears in the serial history (IDM-09) as a CORRECTION event. |
| T10-05 | Negative | Attempt to edit/delete an already-corrected (locked) exception → blocked; audit trail immutable. |

## Cross-Cutting / Integration & Security

| ID | Type | Condition → Expected Outcome |
|----|------|------------------------------|
| TX-01 | Integration-failure | SAP channel down for an extended window → IDM queues/holds outbound; on recovery, all pending batches reconcile exactly once. |
| TX-02 | Security | Expired/invalid session calls any API → 401/redirect; no data returned (Security S-1). |
| TX-03 | Security | User requests a serial/invoice outside their authorised warehouse scope → denied (object-level authz, Security S-2). |
| TX-04 | Reconciliation | Post-go-live reconciliation run → SAP vs. IDM physical inventory variance within agreed threshold (AC-11). |
| TX-05 | Offline (if OI-2 = offline) | Scans captured offline then synced → deduplicated, validated server-side, no double counting. |
| TX-06 | Resilience | Duplicate/replayed inbound or outbound batch → processed exactly once (idempotency), across all integration points. |

---

*Traceability: every acceptance criterion AC-1…AC-11 in the SOW is covered by at least one case above. Negative and integration-failure paths are first-class, reflecting that IDM's core value is catching discrepancies, so its error handling is part of the product, not an afterthought.*
