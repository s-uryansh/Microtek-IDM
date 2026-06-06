import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";

export function createValidationRoutes({ validationService }) {
  const router = Router();

  router.post(
    "/",
    requireAuthContext,
    requirePermission("serial:validate", { warehouseIdFromBody: true }),
    async (request, response, next) => {
      try {
        const result = await validationService.validateSerial({
          ...request.body,
          userId: request.auth.userId
        });
        response.status(200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
