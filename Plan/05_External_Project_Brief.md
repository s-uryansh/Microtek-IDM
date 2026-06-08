# Microtek IDM — Project Brief

**For:** External stakeholders
**Solution:** Basiq360 Inventory & Dispatch Management (IDM)
**Date:** June 2026 · **Status:** Draft for stakeholder review

---

## The Problem

Microtek serialises every unit it manufactures, yet it cannot reliably trust its own inventory records. Two gaps cause this:

- **No serial scan at goods receipt.** When stock arrives at a warehouse, receipt is recorded against the sender's paperwork rather than against the units physically present.
- **A serial mismatch at customer dispatch.** SAP suggests which serial numbers to ship, but operational realities mean the serials actually dispatched are often different.

The consequences are felt across the business: SAP's inventory no longer matches physical stock, accurate inventory-ageing reports cannot be produced, and exceptions are difficult to audit or resolve. Across 2 plants, 2 central warehouses, and 27 regional warehouses, these small discrepancies compound into a material loss of confidence in the numbers.

## The Solution

IDM introduces a **physical-serial system of record** that works alongside SAP and continuously reconciles to it. At every point a unit moves, IDM captures the *actual* serial number scanned on the floor:

- **At receipt** — staff scan each unit; IDM reconciles the scan against what the sender claims to have shipped and flags any short, excess, or wrong-serial discrepancy.
- **At dispatch** — staff scan each item; the physically dispatched serials replace SAP's suggested serials, closing the mismatch at its source.
- **For batteries** — serials are scanned and locked to the invoice *before* billing.
- **On returns** — returned serials are scanned and validated against the original dispatch.

Every scan is validated in roughly one second, and anything that fails is flagged to the user instantly and logged for later correction. Supervisors get a web portal with accurate inventory-ageing reports, a complete movement history for any serial number, and a controlled, fully audited way to correct exceptions. Inventory-age data also flows back into SAP to power a customised SAP-side ageing report.

## Business Impact

- **Inventory you can trust.** SAP and the warehouse floor reconcile to the same physical serials, eliminating the dispatch-leg mismatch at its root.
- **Accurate ageing reports.** Reliable, serial-level receipt dates make ageing analysis possible for the first time — supporting better stock and working-capital decisions.
- **Full traceability and auditability.** Any serial's journey — from production through receipt, transfers, dispatch, and returns — is reconstructable on demand, with every exception and correction attributed and time-stamped.
- **Faster exception resolution.** Discrepancies surface in real time at the point of scan rather than weeks later during a reconciliation scramble.
- **A scalable foundation.** Once proven, the same serial-level data can be exposed to sales and dealer-management systems in a later phase.

## Timeline

A phased delivery keeps risk low and proves value early before scaling to all warehouses.

| Phase | Focus | Indicative window |
|-------|-------|-------------------|
| **Discovery** | Confirm requirements and integration approach | First ~2 weeks |
| **Pilot** | Go live at 1 central + a few regional warehouses: SAP import, scan-based dispatch, ageing report | Following ~10 weeks |
| **Rollout** | Extend to all 27 regional warehouses: receipt scanning, returns, battery gate, exception portal, serial history | Following ~10 weeks |
| **Integration expansion** | Make IDM data available to sales/dealer systems | After go-live |

Timing assumes a short discovery phase in which a set of open decisions — scanning hardware, warehouse connectivity, integration mechanism, reporting formats, and access roles — are confirmed with Microtek.

---

*Prepared by Basiq360. Indicative timeline; final schedule confirmed at contract signature once discovery decisions are closed.*
