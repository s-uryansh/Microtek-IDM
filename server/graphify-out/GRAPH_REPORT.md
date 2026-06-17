# Graph Report - server  (2026-06-17)

## Corpus Check
- 119 files · ~46,317 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 439 nodes · 800 edges · 28 communities (15 shown, 13 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `dd9d4a77`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]

## God Nodes (most connected - your core abstractions)
1. `createApp()` - 35 edges
2. `requirePermission()` - 31 edges
3. `sendError()` - 23 edges
4. `createDefaultServices()` - 21 edges
5. `requireAuthContext()` - 19 edges
6. `createRepositories()` - 18 edges
7. `seed()` - 12 edges
8. `upsertOne()` - 10 edges
9. `scripts` - 9 edges
10. `Microtek IDM Server` - 8 edges

## Surprising Connections (you probably didn't know these)
- `createRepository()` --calls--> `createAdminRepository()`  [EXTRACTED]
  test/admin-repository.test.js → src/admin/adminRepository.js
- `makeApp()` --calls--> `createAuthRoutes()`  [EXTRACTED]
  test/auth-routes.test.js → src/auth/authRoutes.js
- `captureRepository()` --calls--> `createExceptionRepository()`  [EXTRACTED]
  test/exception-warehouse-scope.test.js → src/db/exceptionRepository.js
- `makeApp()` --calls--> `createBatteryPreBillingRoutes()`  [EXTRACTED]
  test/idm03-battery-routes.test.js → src/idm03/batteryPreBillingRoutes.js
- `makeApp()` --calls--> `createFulfilmentStatusRoutes()`  [EXTRACTED]
  test/idm07-fulfilment-routes.test.js → src/idm07/fulfilmentStatusRoutes.js

## Import Cycles
- None detected.

## Communities (28 total, 13 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (32): createAdminRoutes(), getToken(), requireAdminRole(), requireAuthContext(), requirePermission(), sendError(), createMetricsMiddleware(), createRequestContext() (+24 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (18): createAdminRepository(), createAuthRepository(), createAgeingReportRepository(), createBatteryPreBillingRepository(), createDispatchRepository(), createExceptionRepository(), createGrnRepository(), createIntegrationBatchRepository() (+10 more)

### Community 2 - "Community 2"
Cohesion: 0.10
Nodes (32): applyMigration(), ensureMigrationTable(), hasMigration(), listMigrations(), migrationsDir, runMigrations(), startAgeingRefreshSchedule(), appendEventOnce() (+24 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (24): createImportService(), mapValidationError(), normalizeRecord(), parseQrCode(), pickFirst(), toPositiveInteger(), validateProductionRecord(), createValidationService() (+16 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (36): dependencies, bcryptjs, cookie, cors, csv-parse, csv-stringify, dotenv, express (+28 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (13): createPool(), alert(), createGrnService(), exceptionResult(), BATTERY_ALERTS, createBatteryPreBillingService(), createConditionTagService(), defaultConditionTags (+5 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (15): createAdminService(), csvDate(), csvInteger(), csvNumber(), INVOICE_CSV_HEADERS, normalizeText(), VALID_WAREHOUSE_TYPES, createAgeingBucketService() (+7 more)

### Community 7 - "Community 7"
Cohesion: 0.18
Nodes (7): authError(), invalidCredentialsError(), createAuthService(), availablePermissionCodes, createRbacPolicy(), foundationPermissionsByRole, staticPermissionsForRole()

### Community 8 - "Community 8"
Cohesion: 0.18
Nodes (6): createAuthRoutes(), sendAuthError(), createLoginRateLimiter(), createTestLimiter(), loginSchema, makeApp()

### Community 9 - "Community 9"
Cohesion: 0.17
Nodes (5): createDispatchService(), invalidScan(), invalidScanWithException(), createFulfilmentStatusService(), invoice

### Community 10 - "Community 10"
Cohesion: 0.31
Nodes (5): parsePositiveInt(), resolveScope(), createLookupService(), scopedWarehouses(), createService()

### Community 11 - "Community 11"
Cohesion: 0.27
Nodes (5): createLookupRoutes(), forbidden(), parsePositiveInt(), scopedWarehouseIds(), makeApp()

### Community 12 - "Community 12"
Cohesion: 0.22
Nodes (8): API Overview, Architecture, Authentication, Database And Migrations, Microtek IDM Server, RBAC, Security Defaults, Testing

### Community 19 - "Community 19"
Cohesion: 0.50
Nodes (3): rootPackageJson, seedSource, serverPackageJson

## Knowledge Gaps
- **80 isolated node(s):** `name`, `version`, `private`, `type`, `main` (+75 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createRepositories()` connect `Community 1` to `Community 0`, `Community 5`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `createApp()` connect `Community 0` to `Community 2`, `Community 5`, `Community 7`, `Community 8`, `Community 11`, `Community 13`, `Community 14`, `Community 15`, `Community 17`, `Community 18`, `Community 20`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _80 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08128772635814889 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08585858585858586 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.09856035437430787 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.07665505226480836 - nodes in this community are weakly interconnected._