import cors from "cors";
import express from "express";
import helmet from "helmet";

import { createAuthRoutes } from "./auth/authRoutes.js";
import { createAuthService } from "./auth/authService.js";
import { createLoginRateLimiter } from "./auth/loginRateLimiter.js";
import { createPool } from "./db/pool.js";
import { createRepositories } from "./db/repositories.js";
import { createDispatchRoutes } from "./idm05/dispatchRoutes.js";
import { createDispatchExportRoutes } from "./idm05/dispatchExportRoutes.js";
import { createDispatchService } from "./idm05/dispatchService.js";
import { createGrnRoutes } from "./idm02/grnRoutes.js";
import { createGrnService } from "./idm02/grnService.js";
import { createImportRoutes } from "./idm01/importRoutes.js";
import { createImportService } from "./idm01/importService.js";
import { createConditionTagService } from "./idm04/conditionTagService.js";
import { createSrnRoutes } from "./idm04/srnRoutes.js";
import { createSrnService } from "./idm04/srnService.js";
import { createConditionCorrectionService } from "./idm04/conditionCorrectionService.js";
import { createConditionCorrectionRoutes } from "./idm04/conditionCorrectionRoutes.js";
import { createValidationRoutes } from "./idm06/validationRoutes.js";
import { createValidationService } from "./idm06/validationService.js";
import { createFulfilmentStatusRoutes } from "./idm07/fulfilmentStatusRoutes.js";
import { createFulfilmentStatusService } from "./idm07/fulfilmentStatusService.js";
import { createAgeingBucketService } from "./idm08/ageingBucketService.js";
import { createAgeingReportService } from "./idm08/ageingReportService.js";
import { createAgeingRoutes } from "./idm08/ageingRoutes.js";
import { createReconciliationRoutes } from "./idm08/reconciliationRoutes.js";
import { createReconciliationService } from "./idm08/reconciliationService.js";
import { createBatteryPreBillingRoutes } from "./idm03/batteryPreBillingRoutes.js";
import { createBatteryPreBillingService } from "./idm03/batteryPreBillingService.js";
import { createExceptionCorrectionRoutes } from "./idm10/exceptionCorrectionRoutes.js";
import { createExceptionCorrectionService } from "./idm10/exceptionCorrectionService.js";
import { createSerialHistoryRoutes } from "./idm09/serialHistoryRoutes.js";
import { createSerialHistoryService } from "./idm09/serialHistoryService.js";
import { createLookupRoutes } from "./lookups/lookupRoutes.js";
import { createLookupService } from "./lookups/lookupService.js";
import { createAdminRoutes } from "./admin/adminRoutes.js";
import { createAdminService } from "./admin/adminService.js";
import { createRbacPolicy } from "./security/rbacPolicy.js";
import { requireAuthContext, requirePermission } from "./http/authContext.js";
import { sendError } from "./http/errorResponse.js";
import { createGlobalApiLimiter, createScanApiLimiter } from "./http/rateLimiters.js";
import { createMetricsMiddleware, createRequestContext, createRequestLogger, healthHandler } from "./http/observability.js";

function createDefaultServices(config) {
  const pool = createPool(config);
  const repositories = createRepositories(pool);
  const validationService = createValidationService({ repositories });
  const fulfilmentStatusService = createFulfilmentStatusService();
  const conditionTagService = createConditionTagService();
  const ageingReportService = createAgeingReportService({
    repositories,
    bucketService: createAgeingBucketService()
  });

  return {
    pool,
    repositories,
    importService: createImportService({ repositories }),
    validationService,
    fulfilmentStatusService,
    dispatchService: createDispatchService({
      repositories: {
        ...repositories,
        validationService
      },
      fulfilmentStatusService
    }),
    grnService: createGrnService({
      repositories: {
        ...repositories,
        validationService
      }
    }),
    srnService: createSrnService({
      repositories: {
        ...repositories,
        validationService
      },
      conditionTagService
    }),
    conditionCorrectionService: createConditionCorrectionService({
      repositories,
      conditionTagService
    }),
    ageingReportService,
    reconciliationService: createReconciliationService({ repositories }),
    serialHistoryService: createSerialHistoryService({ repositories }),
    lookupService: createLookupService({ repositories }),
    exceptionCorrectionService: createExceptionCorrectionService({ repositories }),
    batteryPreBillingService: createBatteryPreBillingService({
      repositories: {
        ...repositories,
        validationService
      }
    }),
    authService: createAuthService({
      authRepository: repositories.auth,
      tokenSecret: config.authTokenSecret,
      sessionTtlSeconds: config.authSessionTtlSeconds,
      logger: createLoggerLike(config),
      resolvePermissions: repositories.admin?.getPermissionsForRoleCode
        ? (role) => repositories.admin.getPermissionsForRoleCode(role)
        : null
    }),
    adminService: createAdminService({
      repositories,
      adminRepo: repositories.admin
    })
  };
}

function createLoggerLike(config) {
  return config.logLevel === "silent" ? { info: () => {}, warn: () => {} } : console;
}

function parseTestWarehouseIds(value) {
  return String(value || "")
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter(Number.isInteger);
}

function createTestHeaderAuthService() {
  return {
    async authenticateHeaders(request) {
      const userId = request.get("x-user-id");
      const role = request.get("x-user-role");
      if (!userId || !role) return null;
      return {
        userId,
        username: userId,
        role,
        warehouseIds: parseTestWarehouseIds(request.get("x-warehouse-ids"))
      };
    }
  };
}

export function createApp({ config, logger = console, services, rbacPolicy = null }) {
  const app = express();
  const resolvedServices = services ?? createDefaultServices(config);
  const rolePermissionResolver = config.nodeEnv === "test"
    ? null
    : (resolvedServices.repositories?.admin?.getPermissionsForRoleCode
        ? (role) => resolvedServices.repositories.admin.getPermissionsForRoleCode(role)
        : null);
  const resolvedRbacPolicy = rbacPolicy ?? createRbacPolicy({
    resolvePermissionsForRole: rolePermissionResolver
  });
  const testHeaderAuthService = config.nodeEnv === "test" ? createTestHeaderAuthService() : null;
  const authService = resolvedServices.authService && testHeaderAuthService
    ? { ...resolvedServices.authService, authenticateHeaders: testHeaderAuthService.authenticateHeaders }
    : (resolvedServices.authService ?? testHeaderAuthService);
  const metricsMiddleware = createMetricsMiddleware();

  app.locals.pool = resolvedServices.pool;
  app.locals.metrics = metricsMiddleware;

  app.disable("x-powered-by");
  // Trust the configured number of proxy hops so request.ip is the real client
  // (IP-keyed rate limiting depends on this). Defaults to false — never blanket-true.
  app.set("trust proxy", config.trustProxy ?? false);
  app.use(createRequestContext({ logger }));
  app.use((request, _response, next) => {
    request.rbacPolicy = resolvedRbacPolicy;
    request.authService = authService;
    next();
  });
  app.use(helmet());
  app.use(createRequestLogger({ logger }));
  app.use(metricsMiddleware);
  app.use("/api", createGlobalApiLimiter(config));
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true
    })
  );
  app.use(express.json({
    limit: "1mb",
    verify: (request, _response, buf) => {
      request.rawBody = buf;
    }
  }));

  app.get("/health", (_request, response) => {
    response.status(200).json({
      status: "ok",
      service: "microtek-idm-api"
    });
  });
  app.get("/api/health", healthHandler);
  // Internal endpoint for pilot diagnostics. Requires an authenticated admin
  // (admin:access); an IP allowlist or internal port can be layered on later.
  app.get("/api/metrics", requireAuthContext, requirePermission("admin:access"), (_request, response) => {
    response.status(200).json(metricsMiddleware.snapshot());
  });

  app.use(
    "/api/auth",
    createAuthRoutes({
      authService,
      loginRateLimiter: createLoginRateLimiter({
        redisUrl: config.redisUrl,
        nodeEnv: config.nodeEnv
      }),
      cookieOptions: { secure: config.nodeEnv === "production" }
    })
  );
  app.use("/api/idm-01/import", createImportRoutes({ importService: resolvedServices.importService, importWebhookSecret: config.importWebhookSecret }));
  app.use("/api/idm-02/grns", createGrnRoutes({ grnService: resolvedServices.grnService }));
  app.use("/api/idm-04/srns", createSrnRoutes({ srnService: resolvedServices.srnService }));
  app.use(
    "/api/idm-04/condition",
    createConditionCorrectionRoutes({ conditionCorrectionService: resolvedServices.conditionCorrectionService })
  );
  app.use("/api/idm-06/validate", createScanApiLimiter(config), createValidationRoutes({ validationService: resolvedServices.validationService }));
  app.use("/api/idm-05/dispatches", createDispatchRoutes({ dispatchService: resolvedServices.dispatchService }));
  app.use("/api/idm-05/dispatches", createDispatchExportRoutes({ dispatchService: resolvedServices.dispatchService }));
  app.use(
    "/api/idm-07",
    createFulfilmentStatusRoutes({
      fulfilmentStatusService: resolvedServices.fulfilmentStatusService,
      repositories: resolvedServices.repositories
    })
  );
  app.use("/api/idm-08/ageing", createAgeingRoutes({ ageingReportService: resolvedServices.ageingReportService }));
  app.use(
    "/api/idm-08/reconciliation",
    createReconciliationRoutes({ reconciliationService: resolvedServices.reconciliationService })
  );
  app.use("/api/idm-09", createSerialHistoryRoutes({ serialHistoryService: resolvedServices.serialHistoryService }));
  app.use(
    "/api/idm-10/exceptions",
    createExceptionCorrectionRoutes({ exceptionCorrectionService: resolvedServices.exceptionCorrectionService })
  );
  app.use(
    "/api/idm-03",
    createScanApiLimiter(config),
    createBatteryPreBillingRoutes({ batteryPreBillingService: resolvedServices.batteryPreBillingService })
  );
  app.use("/api/lookups", createLookupRoutes({ lookupService: resolvedServices.lookupService }));
  app.use("/api/admin", createAdminRoutes({ adminService: resolvedServices.adminService }));

  app.use((_request, response) => {
    sendError(response, 404, "NOT_FOUND", "Resource not found");
  });

  app.use((error, _request, response, _next) => {
    logger.error?.({ error }, "Unhandled request error");
    sendError(response, 500, "INTERNAL_SERVER_ERROR", "An internal error occurred");
  });

  return app;
}
