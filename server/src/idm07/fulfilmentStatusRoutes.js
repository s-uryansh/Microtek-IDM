import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";
import { sendError } from "../http/errorResponse.js";

export function createFulfilmentStatusRoutes({ fulfilmentStatusService, repositories }) {
  const router = Router();

  router.get(
    "/orders/:invoiceId/status",
    requireAuthContext,
    requirePermission("fulfilment:read"),
    async (request, response, next) => {
      try {
        // Invoices are warehouse-agnostic, so fulfilment status is not
        // warehouse-scoped — the fulfilment:read permission is the gate.
        const invoiceId = Number.parseInt(request.params.invoiceId, 10);

        // Guard against a non-numeric id (e.g. "NaN") reaching the bigint query
        // and surfacing as a Postgres 22P02 / 500 instead of a clean 400.
        if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
          sendError(response, 400, "BAD_REQUEST", "Invoice ID must be a positive integer");
          return;
        }

        const result = await fulfilmentStatusService.getInvoiceStatus({
          invoiceId,
          repositories
        });

        if (!result) {
          sendError(response, 404, "NOT_FOUND", "Resource not found");
          return;
        }

        response.status(200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
