# Microtek IDM — Project Foundation Pack

Prepared by Basiq360 (acting Lead PM + Technical Architect). All documents use a shared feature-ID scheme (`IDM-01`…`IDM-11`) and acceptance-criteria scheme (`AC-1`…`AC-11`) so they cross-reference cleanly.

| # | Document | Purpose |
|---|----------|---------|
| — | `PROGRESS.md` | Living tracker: feature, status, assignee, last-updated, open items |
| 01 | `01_Statement_of_Work.md` | Objectives, scope, deliverables, acceptance criteria, timeline |
| 02 | `02_Implementation_Plan.md` | Sprint roadmap + dependency map + SAP/SFA-DMS critical path |
| 03 | `03_SQL_Migration_and_Database_Plan.md` | Schema, migration waves, rollback, validation |
| 04 | `04_Security_Audit_Report_Draft.md` | Preliminary security review + mitigations |
| 05 | `05_External_Project_Brief.md` | Stakeholder brief: Problem / Solution / Impact / Timeline |
| 06 | `06_Data_Seeding_Strategy.md` | Per-module demo seed data incl. edge cases |
| 07 | `07_Test_Case_Suite.md` | Condition→Outcome cases per module (positive/negative/integration) |
| 08 | `08_Research_and_Suggestions.md` | Architecture, technology, and process optimisation |

**Scope note:** the IDM Scope Document is the authoritative build spec; the DMS Process Flow is surrounding-system context (existing serial/coupon scanning, EWMS, SAP FTP cadence) that shaped several design decisions — most importantly the recommendation to define a single canonical serial identity across IDM and the existing DMS.

**Before design freeze:** close open items OI-1…OI-11 (tracked in `PROGRESS.md`). Several High-severity security findings and the IDM-02/03/04/07/08 builds depend on these decisions.
