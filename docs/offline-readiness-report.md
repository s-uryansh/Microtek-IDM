# Offline Readiness Report

Last updated: 2026-06-07

## Current Status

Offline mode is not implemented. The React web portal sends scan requests directly to the API through the shared fetch client. There is no IndexedDB/localStorage scan queue, background sync worker, retry ledger, or conflict-resolution UI.

Wave 4 added mobile-responsive web scanning, browser camera scanning, hardware keyboard-wedge scanning, duplicate detection inside the active scan session, and scan history. Post-Wave 4 scanner compatibility added `@zxing/browser` fallback when native `BarcodeDetector` is unavailable. These are still online workflows.

## Recommended Architecture

- Store in-progress scan commands in IndexedDB, not localStorage.
- Assign a client-generated command ID to each queued scan.
- Persist workflow context with each command: module, session ID, warehouse ID, invoice line ID where required, serial number, scanned timestamp, operator ID, and local device ID.
- Add a sync engine that retries queued commands when connectivity returns.
- Show per-scan sync state: queued, syncing, accepted, rejected, conflict, needs review.
- Keep backend writes idempotent using command IDs or existing unique constraints where suitable.
- Add backend response contracts that distinguish validation rejection from transport failure and stale-session conflict.

## Conflict Strategy

Expected conflicts:

- Serial already scanned by another device.
- Dispatch/GRN completed before queued scan syncs.
- Battery serial committed to another invoice line.
- Operator warehouse scope changed while offline.
- Serial status changed after offline scan capture.

Recommended handling:

- Never silently drop a queued scan.
- Sync in captured order per workflow session.
- Treat backend validation failures as terminal rejected scan results.
- Treat stale workflow/session conflicts as `needs review`.
- Require supervisor review for conflicts that imply inventory movement ambiguity.

## Required Backend Changes

- Idempotency key support on GRN, Dispatch, SRN, and Battery scan endpoints.
- Optional client scan timestamp capture.
- Stable conflict/error codes across scan endpoints.
- Queue-safe session status endpoints so the client can preflight sync.
- Server-side audit fields for client command ID and device ID.

## Risks

- Offline scans can represent stock movement that is no longer valid by the time sync occurs.
- Warehouse operators may assume queued scans are committed unless the UI makes sync state obvious.
- Multi-device scanning against the same GRN/dispatch increases duplicate/conflict frequency.
- Cookie session expiry during offline work can block sync until reauthentication.
- Persistent browser cookies survive browser reopen until session expiry, but they do not remove the need for explicit offline reauthentication and sync-state handling.

## Future Implementation Plan

1. Add backend idempotency and conflict response contracts.
2. Add IndexedDB queue and scan command model.
3. Add online/offline state and queue indicators to scan sessions.
4. Add sync worker with ordered retry.
5. Add conflict review UI for supervisors.
6. Add integration tests for queued GRN, Dispatch, SRN, and Battery scans.
7. Pilot offline behavior in one warehouse before rollout.
