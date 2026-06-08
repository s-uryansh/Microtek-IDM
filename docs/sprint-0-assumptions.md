# Sprint 0 Foundation Assumptions

Last updated: 2026-06-06

## Confirmed for implementation

- Frontend: React.
- Backend: Node.js with Express.
- Database: PostgreSQL.
- Migration style: versioned SQL files under `db/migrations`, with paired `V###` and `U###` scripts before go-live.

## Still blocked by discovery

- `OI-7`: SAP integration mechanism and data contracts.
- `OI-9`: final role hierarchy and permission matrix.
- `OI-2`: online vs. offline mobile posture.
- `OI-10`: opening-stock reconciliation threshold and cutover rules.

## Historical sprint boundary

This document records the original Sprint 0 assumptions. It is not the current implementation status.

Current code now includes backend/web implementation for IDM-01 through IDM-10 current paths, V001 through V008 migrations, cookie-backed pilot authentication, and expanded RBAC permissions. SAP transport integration remains not implemented.
