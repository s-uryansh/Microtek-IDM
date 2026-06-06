import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";

export function createImportRoutes({ importService }) {
  const router = Router();

  router.post(
    "/production",
    requireAuthContext,
    requirePermission("integration:import"),
    async (request, response, next) => {
      try {
        const result = await importService.importProductionBatch({
          ...request.body,
          receivedBy: request.auth.userId
        });
        response.status(result.status === "DUPLICATE_IGNORED" ? 200 : 202).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
