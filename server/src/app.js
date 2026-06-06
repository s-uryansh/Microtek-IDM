import cors from "cors";
import express from "express";
import helmet from "helmet";

import { createPool } from "./db/pool.js";
import { createRepositories } from "./db/repositories.js";
import { createDispatchRoutes } from "./idm05/dispatchRoutes.js";
import { createDispatchService } from "./idm05/dispatchService.js";
import { createGrnRoutes } from "./idm02/grnRoutes.js";
import { createGrnService } from "./idm02/grnService.js";
import { createImportRoutes } from "./idm01/importRoutes.js";
import { createImportService } from "./idm01/importService.js";
import { createConditionTagService } from "./idm04/conditionTagService.js";
import { createSrnRoutes } from "./idm04/srnRoutes.js";
import { createSrnService } from "./idm04/srnService.js";
import { createValidationRoutes } from "./idm06/validationRoutes.js";
import { createValidationService } from "./idm06/validationService.js";
import { createFulfilmentStatusRoutes } from "./idm07/fulfilmentStatusRoutes.js";
import { createFulfilmentStatusService } from "./idm07/fulfilmentStatusService.js";
import { createAgeingBucketService } from "./idm08/ageingBucketService.js";
import { createAgeingReportService } from "./idm08/ageingReportService.js";
import { createAgeingRoutes } from "./idm08/ageingRoutes.js";
import { createReconciliationRoutes } from "./idm08/reconciliationRoutes.js";
import { createReconciliationService } from "./idm08/reconciliationService.js";
import { createSerialHistoryRoutes } from "./idm09/serialHistoryRoutes.js";
import { createSerialHistoryService } from "./idm09/serialHistoryService.js";
import { createRbacPolicy } from "./security/rbacPolicy.js";

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
    ageingReportService,
    reconciliationService: createReconciliationService({ repositories }),
    serialHistoryService: createSerialHistoryService({ repositories })
  };
}

export function createApp({ config, logger = console, services, rbacPolicy = createRbacPolicy() }) {
  const app = express();
  const resolvedServices = services ?? createDefaultServices(config);

  app.disable("x-powered-by");
  app.use((request, _response, next) => {
    request.rbacPolicy = rbacPolicy;
    next();
  });
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.status(200).json({
      status: "ok",
      service: "microtek-idm-api"
    });
  });

  app.use("/api/idm-01/import", createImportRoutes({ importService: resolvedServices.importService }));
  app.use("/api/idm-02/grns", createGrnRoutes({ grnService: resolvedServices.grnService }));
  app.use("/api/idm-04/srns", createSrnRoutes({ srnService: resolvedServices.srnService }));
  app.use("/api/idm-06/validate", createValidationRoutes({ validationService: resolvedServices.validationService }));
  app.use("/api/idm-05/dispatches", createDispatchRoutes({ dispatchService: resolvedServices.dispatchService }));
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

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Resource not found"
      }
    });
  });

  app.use((error, _request, response, _next) => {
    logger.error?.({ error }, "Unhandled request error");
    response.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An internal error occurred"
      }
    });
  });

  return app;
}
