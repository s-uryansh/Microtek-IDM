# Sprint 1 Assumptions

Last updated: 2026-06-06

## Confirmed

- Frontend: React.
- Backend: Node.js with Express.
- Database: PostgreSQL.
- Sprint 1 scope is limited to IDM-01, IDM-06, TEC-INT inbound architecture, and TEC-DB V002.

## Historical implementation boundaries

This document records Sprint 1 assumptions, not current project status.

- SAP outbound integrations are still not implemented.
- IDM-02, IDM-03, IDM-04, IDM-05, IDM-07, IDM-08, IDM-09, and IDM-10 now have implemented backend/web paths.
- IDM-11 remains not implemented.
- `sap_dispatch_doc` and related line tables are not created in V002 because the SQL roadmap places document/GRN tables later. The current IDM-01 implementation supports production serial imports and leaves factory-dispatch document persistence for the confirmed OI-7 contract and later schema waves.
- `exception_log` is included in V002 because IDM-06 cannot meet AC-6 without persisted validation failures.

## Security posture

- API routes require an explicit request auth context and default-deny RBAC permission checks.
- Database repositories use parameterized `pg` queries.
- Inbound payloads and serial validation requests are validated with schemas before service processing.
- API responses are field-minimized and do not expose stack traces.
