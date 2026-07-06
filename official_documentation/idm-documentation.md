# IDM-01 Production Serial Import

Basically factory or SAP telling that this product now exist. Birth record of every unit.

# IDM-02 GRN (Goods Receipt Notes)
A truck arrives carrying what the SAP dispatch document says it carries. The operator scans each serial as it comes off the truck, and IDM matches it against the expected list:
  - serial expected and present → MATCHED (unit becomes IN_STOCK at this warehouse)
  - expected but never scanned → SHORT (a shortage)
  - scanned but not on the list → EXCESS or WRONG_SERIAL
  - sent to the wrong warehouse → WRONG_WAREHOUSE
  - same item scanned twice → DUPLICATE_SCAN
  
`receive against an expected dispatch and reconcile what physically showed up vs what was promised. It's the inbound counterpart to Dispatch.`
# IDM-03 Battery pre-billing
Reserving/earmarking specific battery serials to an invoice before the dispatch/billing is finalised.

Batteries are special, they have to be committed to an invoice line ahead of time. The operator scans battery serials and IDM "locks" each one to that invoice line (one serial → one line, no double-booking). Validates it's actually a battery product and matches the line.

# IDM-04 SRN (Sales Return Note)
The reverse of dispatch.

A unit that was dispatched comes back. The operator scans it and tags its condition: SALEABLE, DEFECTIVE, or REPAIR. IDM checks the serial was genuinely dispatched before (NO_ORIGINAL_DISPATCH if not) and blocks returning the same unit twice (ALREADY_RETURNED). This is where "damaged product coming back" is recorded

# IDM-05 Dispatch
Sending stock out to a customer against an invoice.
An invoice says "customer X needs 5 × 1KVA inverters." The operator scans 5 in-stock serials; IDM flips each from IN_STOCK → DISPATCHED, allocates it to the right invoice line, and stops at the target quantity (DISPATCH_QUANTITY_REACHED if you over-scan). When complete it can be exported to SAP. Not warehouse-to-warehouse warehouse-to-customer.


# IDM-06 Serial Validation
The shared rule-checker that runs inside GRN/Dispatch/SRN/Battery scans. Backend-only, no page of its own.

Every scan asks the same gatekeeper: does this serial exist? Is it in the right warehouse? Already dispatched? Does its product match the invoice? It runs the checks in order and, on failure, creates an Exception automatically. This is the engine that generates the exceptions IDM-10 later resolves.

# IDM-07 Fulfilment Status
A progress read-out for an order.

For a given invoice, how far along are we? It compares required quantity vs scanned vs committed and reports PENDING / IN_PROGRESS / DISPATCHED. Pure read — "is this order done yet?

# IDM-08 Ageing  & Reconciliation
Two things. Ageing = how long stock has been sitting; Reconciliation = does our count match SAP's.

- Ageing: for every in-stock unit, how many days since it was received. Bucketed into 0–30 / 31–60 / 61–90 / 91+ days so you can spot slow-moving/old inventory, with drill-down to the actual serials. (Built off a materialized view refreshed on a schedule.)
- Reconciliation: opening-stock variance — SAP says we have 10, IDM counted 9 → variance −1. Flags discrepancies between the two systems.
# IDM-09 Serial History
The full life story / audit trail of one serial.
Type a serial number and see its whole timeline merged in order: produced → factory-dispatched → received → dispatched → returned, plus every exception raised and every correction made, with who did what and when. This is the "traceability" feature.

# IDM-10 Exception Correction
The workbench for resolving the problems that validation flagged.
When a scan fails (wrong warehouse, already dispatched, product mismatch, short/excess, etc.), an exception is logged with status OPEN. A supervisor/admin reviews it, enters a correction reason, and marks it CORRECTED which also stamps a CORRECTION event onto that serial's history.