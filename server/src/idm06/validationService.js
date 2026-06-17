import { validationRequestSchema } from "../models/validationSchemas.js";

const messages = {
  MALFORMED_SERIAL: "Serial format is invalid.",
  NOT_FOUND: "Serial was not found in IDM.",
  ALREADY_DISPATCHED: "Serial has already been dispatched.",
  WRONG_WAREHOUSE: "Serial belongs to a different warehouse."
  ,
  PRODUCT_INVOICE_MISMATCH: "Serial product does not match the invoice line."
};

function toPublicSerial(serial) {
  return {
    serialId: serial.serialId,
    serialNo: serial.serialNo,
    currentStatus: serial.currentStatus,
    currentWarehouseId: serial.currentWarehouseId,
    conditionTag: serial.conditionTag ?? null,
    productId: serial.productId
  };
}

export function createValidationService({ repositories }) {
  async function fail({ request, ruleCode }) {
    const exception = await repositories.exceptionsRepo.createException({
      serialNo: request.serialNo,
      ruleCode,
      contextType: request.contextType,
      contextId: request.contextId,
      // Persist the warehouse so BATTERY/IMPORT/FOUNDATION exceptions (which
      // have no grn/dispatch/srn row to join against) remain visible to
      // warehouse-scoped users. May be undefined on early MALFORMED_SERIAL
      // failures, in which case it is stored as NULL.
      warehouseId: request.warehouseId,
      raisedBy: request.userId,
      createdBy: request.userId
    });

    return {
      valid: false,
      serial: null,
      alert: {
        ruleCode,
        message: messages[ruleCode]
      },
      exception: {
        exceptionId: exception.exceptionId,
        ruleCode: exception.ruleCode,
        status: exception.status ?? "OPEN"
      }
    };
  }

  return {
    async validateSerial(input) {
      const parsed = validationRequestSchema.safeParse(input);

      if (!parsed.success) {
        const serialNo = typeof input?.serialNo === "string" ? input.serialNo : null;
        return fail({
          request: {
            serialNo,
            contextType: input?.contextType ?? "FOUNDATION",
            contextId: input?.contextId,
            userId: input?.userId ?? "UNKNOWN"
          },
          ruleCode: "MALFORMED_SERIAL"
        });
      }

      const request = parsed.data;
      const serial = await repositories.serials.findBySerialNo(request.serialNo);

      if (!serial) {
        return fail({ request, ruleCode: "NOT_FOUND" });
      }

      if (serial.currentStatus === "DISPATCHED" && request.contextType !== "SRN") {
        return fail({ request, ruleCode: "ALREADY_DISPATCHED" });
      }

      if (
        request.warehouseId &&
        request.contextType === "GRN" &&
        serial.destinationWarehouseId &&
        serial.destinationWarehouseId !== request.warehouseId
      ) {
        return fail({ request, ruleCode: "WRONG_WAREHOUSE" });
      }

      if (
        request.warehouseId &&
        (request.contextType !== "GRN" || !serial.destinationWarehouseId) &&
        serial.currentWarehouseId &&
        serial.currentWarehouseId !== request.warehouseId
      ) {
        return fail({ request, ruleCode: "WRONG_WAREHOUSE" });
      }

      if (request.expectedProductId && serial.productId !== request.expectedProductId) {
        return fail({ request, ruleCode: "PRODUCT_INVOICE_MISMATCH" });
      }

      return {
        valid: true,
        serial: toPublicSerial(serial),
        alert: null,
        exception: null
      };
    }
  };
}
