# IDM-03 Battery Pre-Billing — Implementation Assumptions

**Date:** 2026-06-06

## Scope

Battery serial numbers are committed against invoice lines before SAP billing. The commit reserves the serial for a specific invoice line without changing its `serial_master.current_status` (remains `IN_STOCK`). The pre-billing status is tracked solely in the `battery_pre_billing` table and `PRE_BILLING` serial events.

## Assumptions

1. **Battery flag on product**: The `product.is_battery` flag is the single source of truth for battery segment gating. Only invoice lines whose product has `is_battery = TRUE` can receive pre-billing commits.

2. **Serial stays IN_STOCK**: Pre-billing does not alter `serial_master.current_status`. The reservation is tracked via the `UNIQUE (serial_id)` constraint on `battery_pre_billing`. This avoids introducing a `RESERVED` status and keeps serial lifecycle transitions unchanged.

3. **Duplicate commit protection**: The `UNIQUE (serial_id)` constraint on `battery_pre_billing` guarantees that a serial cannot be committed more than once. The service also performs an application-level check before the insert for a better error message.

4. **Product match enforcement**: The commit endpoint passes `expectedProductId` to the IDM-06 validation service, which validates that the serial's product matches the invoice line's product. This catches `PRODUCT_INVOICE_MISMATCH` at the validation layer.

5. **Already-dispatched prevention**: The IDM-06 validation service checks `serial_master.current_status != 'DISPATCHED'`. This catches already-dispatched serials before the commit proceeds.

6. **Wrong warehouse prevention**: The commit endpoint passes `warehouseId` from the invoice (via invoice line join) to the validation service for `WRONG_WAREHOUSE` detection.

7. **SAP billing failure (T03-05)**: SAP billing failure is out of scope for this backend implementation. The assumption is that SAP will handle its own idempotency and retry logic. The `battery_pre_billing` table provides an append-only audit trail that SAP can query to verify which serials were committed.

8. **Fulfilment status includes committedQuantity**: The IDM-07 fulfilment status endpoint now includes a `committedQuantity` field reflecting the number of battery serials committed to the invoice.

## Open Items

- None specific to IDM-03.
