# Microtek — Inventory & Dispatch Management (IDM) Solution
## Scope of Work | Internal Reference Document

**Client:** Microtek  
**Solution:** Basiq360 IDM (Inventory & Dispatch Management)  
**Prepared by:** Basiq360  
**Date:** June 2026  
**Status:** Draft — Pending Client Confirmation

---

## 1. Background & Problem Statement

Microtek operates the following supply chain infrastructure:

| Entity | Count |
|---|---|
| Manufacturing Plants | 2 |
| Central Warehouses | 2 |
| Regional Warehouses | 27 |

### Current Flow & Pain Points

- All units are **serialised at the point of production**.
- Serial numbers are scanned at factory dispatch, and a **GRN is raised at the receiving warehouse** — however, **no serial scanning is performed at GRN**. Traceability at this leg relies on bill serials from the sender.
- At the time of **customer dispatch**, SAP suggests serial numbers and the integrated application performs a physical scan. However, **business constraints lead to a mismatch** between SAP-suggested serials and the serials actually dispatched.
- This mismatch causes:
  - **Inventory disconnect** between SAP records and physical stock.
  - **Inability to generate inventory ageing reports** accurately.
  - Reduced auditability and exception resolution capability.

---

## 2. Proposed Solution Overview

Basiq360's IDM solution will act as the **serial-level inventory tracking layer**, integrated bidirectionally with SAP, ensuring physical serial movements are recorded accurately at every node.

---

## 3. Scope of Work — Functional Modules

### 3.1 SAP Integration — Production & Factory Dispatch Data Import

- IDM will integrate with SAP to **import all production and factory dispatch data**, including serial numbers, product details, destination warehouse, and invoice/GRN references.
- This integration is **already agreed (OK)** and serves as the foundation dataset for all downstream tracking.

**Key data points to import:**
- Production serial numbers with batch/product metadata
- Factory dispatch invoices with serial-to-invoice mapping
- Destination warehouse details

---

### 3.2 Goods Receipt Note (GRN) — Warehouse Inward

GRN behaviour varies by source:

| Source of Stock | GRN Method |
|---|---|
| Factory → Central / Regional Warehouse | Scan-based GRN against **physical serials**, not SAP bill serials |
| Inter-warehouse transfers | Scan-based GRN |

- IDM will **record the GRN transaction** against the physically scanned serial numbers.
- The scanned serials at GRN will be **reconciled against the sender's dispatch document** to identify any discrepancies (short shipment, excess, wrong serials).
- GRN exceptions will be logged for review and correction.

> **Note:** For plant-to-warehouse movement, GRN integration with SAP dispatch is already in scope (OK). The new requirement is scan-based GRN for movements **from Central Warehouse and Branch Warehouses**.

---

### 3.3 Battery Segment — Pre-Billing Scan

- For the **Battery product category**, a mandatory **serial scan will be performed before billing**, mirroring the factory dispatch process.
- This ensures battery serials are committed to the invoice before the billing transaction is raised in SAP.
- This adds a product-segment-specific workflow gate in IDM.

---

### 3.4 Sales Return Note (SRN) — Customer Returns

- When products are returned by customers, an **SRN will be created in IDM by scanning the physical serial numbers** of returned items.
- Scanned return serials will be validated against the original dispatch record.
- Stock will be updated in IDM upon SRN completion and reconciled with SAP.
- Condition/status tagging at return (e.g., saleable, defective) to be confirmed with client.

---

### 3.5 Warehouse Dispatch — Serial Scan Against Invoice

- All stock movements out of any warehouse (central or regional) will require **physical scanning of each item's serial number** in the IDM mobile app before dispatch.
- Dispatched serials will be mapped to the corresponding SAP invoice, replacing the current SAP-suggested serial assignment.
- This is the **primary fix** for the SAP vs. physical inventory mismatch.
- Already agreed as in scope (OK).

---

### 3.6 Real-Time Serial Validation

- Each serial scanned during any transaction (GRN, dispatch, SRN) will be **validated in real time** (target: ~1 second response).
- Validation checks will include:

| Validation Rule | Action on Failure |
|---|---|
| Serial already dispatched | Alert user, log exception |
| Serial belongs to a different warehouse | Alert user, log exception |
| Serial not found in IDM database | Alert user, log exception |
| Serial mismatch with product/invoice | Alert user, log exception |

- Exceptions are **communicated to the user immediately via app feedback** and **recorded in the IDM database** for audit and correction.

---

### 3.7 Order Fulfilment Status

- Once all items on an invoice/dispatch order are scanned and dispatched, the order will be **marked as "Dispatched"** in the IDM app.
- Partial dispatch status to be confirmed (whether partial orders can be saved and completed later).

---

### 3.8 Inventory Ageing Report

- IDM will maintain the serial-level inventory receipt date for each warehouse.
- **Ageing reports** will be available via the IDM web portal.
- Additionally, a **customised ageing report will be generated from SAP**, using inventory age data sourced from IDM via integration.
- Report parameters (ageing buckets, product/warehouse filters, export format) to be finalised during design.

---

### 3.9 Serial Number Transaction History Report

- The IDM web portal will provide a **complete transaction history for any serial number**, including:
  - Production record
  - Factory dispatch
  - GRN at each warehouse
  - Inter-warehouse transfers
  - Customer dispatch (with invoice reference)
  - Returns (SRN)
  - Any exception events

---

### 3.10 Exception Management — Web Portal

- Authorised users will be able to **correct exceptions** via the IDM web portal by:
  - Posting the corrective transaction
  - Providing a reason for the exception
- All corrections will be **timestamped, user-attributed, and retained for audit and reporting**.

---

## 4. Technical Scope

### 4.1 IDM Application

| Component | Details |
|---|---|
| Mobile App | For warehouse staff — serial scanning, GRN, dispatch, SRN |
| Web Portal | For supervisors/managers — reports, exception management, configuration |
| Database | Separate Basiq360-managed database for IDM (not shared with SAP) |

### 4.2 Performance Requirements

- Serial scan response time: **~1 second per scan**
- System must support **concurrent scanning** across multiple warehouses simultaneously
- Number of concurrent users / expected daily scan volume — *to be confirmed by client*

### 4.3 SAP Integration Architecture

- Bidirectional integration between IDM and SAP
- Data flows:
  - SAP → IDM: Production data, factory dispatch, invoice creation events
  - IDM → SAP: Ageing data for reporting, confirmed dispatch serials (to reconcile SAP inventory)
- Integration mechanism (API/BAPI/RFC/middleware) — *to be confirmed during technical design*

### 4.4 Third-Party Integrations (Future)

- IDM data to be made available to **SFA (Sales Force Automation)** and **DMS (Dealer Management System)** via separate integration APIs.
- This is flagged as a future integration and is **not in scope for the current phase**.

---

## 5. Open Items & Assumptions

The following items require client confirmation before finalising the scope:

| # | Open Item | Impact |
|---|---|---|
| 1 | Scanning hardware to be used (handheld barcode scanners, mobile devices, barcode vs. QR) | App and hardware compatibility |
| 2 | Connectivity at all 27 regional warehouses (internet availability, offline mode need) | Architecture and sync design |
| 3 | Condition tagging for returned items via SRN (saleable / defective / repair) | SRN module design |
| 4 | Partial dispatch handling — can an order be partially scanned and resumed? | Dispatch workflow design |
| 5 | Number of concurrent users per warehouse | Infrastructure sizing |
| 6 | Expected daily scan volume (units per day per warehouse) | DB and performance sizing |
| 7 | SAP integration mechanism (API, middleware, file-based) | Integration architecture |
| 8 | Ageing report buckets and output format (Excel, PDF, SAP report) | Report design |
| 9 | User roles and access hierarchy (who can post corrections, view reports, configure) | Access control design |
| 10 | Existing inventory reconciliation — how to handle the opening stock discrepancy before go-live | Data migration / go-live plan |
| 11 | Pilot warehouse selection and scope for pilot phase | Pilot planning |

---

## 6. Out of Scope (Current Phase)

- Integration with SFA / DMS (flagged for future phase)
- Any changes to SAP configuration or SAP business logic
- Hardware procurement for scanning devices
- Changes to existing ERP workflows beyond the integration touchpoints defined above

---

## 7. Suggested Phasing (For Discussion)

| Phase | Scope |
|---|---|
| **Phase 1 — Pilot** | 1 central warehouse + 2–3 regional warehouses; SAP import integration; scan-based dispatch; ageing report |
| **Phase 2 — Rollout** | All 27 regional warehouses; GRN scan; SRN; exception portal; battery pre-billing scan |
| **Phase 3 — Integration Expansion** | SFA / DMS integration |

---

## 8. Summary of Module Status

| Module | Status |
|---|---|
| SAP → IDM production & factory dispatch import | Agreed — In Scope |
| Scan-based GRN (Central & Regional Warehouses) | **New Requirement** |
| Battery segment pre-billing scan | **New Requirement** |
| SRN — Customer returns with serial scan | **New Requirement** |
| Warehouse dispatch with serial scan | Agreed — In Scope |
| Real-time serial validation with exception logging | Agreed — In Scope |
| Order fulfilment status marking | Agreed — In Scope |
| Inventory ageing report (IDM portal + SAP integration) | Agreed — In Scope (customisation needed) |
| Serial number transaction history report | **New Requirement** |
| Exception correction via web portal | Agreed — In Scope |
| SFA / DMS integration | Out of Scope — Future Phase |

---

*This document is intended for internal circulation. Please review the open items and confirm responses before sharing the proposal with the client.*
