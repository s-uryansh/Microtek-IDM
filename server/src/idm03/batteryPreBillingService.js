const BATTERY_ALERTS = {
  NOT_BATTERY_LINE: "This serial's product is not a battery item on the selected invoice.",
  ALREADY_COMMITTED: "Serial is already committed to an invoice.",
  WRONG_WAREHOUSE: "Serial belongs to a different warehouse.",
  QUANTITY_REACHED: "All battery units for this invoice line have already been pre-billed."
};

export function createBatteryPreBillingService({ repositories }) {
  return {
    // Operator enters the invoice, then scans battery serials. The invoice line
    // is resolved from the scanned serial's product — no manual line picking —
    // so a serial can never be committed against the wrong (non-battery) line.
    // Product-first commit (mirrors GRN): the operator selects the battery product
    // on the invoice, then scans the raw base serial for it. `productId` is that
    // selected-product context, forwarded to validateSerial as `expectedProductId`,
    // which (a) disambiguates a base serial shared by several products to the
    // selected product's row and (b) rejects a scan whose resolved product does not
    // match the selection (PRODUCT_INVOICE_MISMATCH). `productId` is optional: when
    // omitted the battery line is still resolved from the scanned serial's product.
    async commitSerial({ invoiceId, serialNo, productId, userId, userWarehouseIds = [] }) {
      const invoice = await repositories.invoices.findById(invoiceId);

      if (!invoice) {
        throw Object.assign(new Error("Invoice not found"), { status: 404 });
      }

      // Validate the serial on its own (format, exists in IDM, not already
      // dispatched). Warehouse scope is enforced below against the operator's
      // assigned warehouses, like dispatch.
      const validation = await repositories.validationService.validateSerial({
        serialNo,
        contextType: "BATTERY",
        contextId: invoiceId,
        expectedProductId: productId ?? undefined,
        userId
      });

      if (!validation.valid) {
        return validation;
      }

      const serial = validation.serial;
      const inScope = userWarehouseIds.some(
        (warehouseId) => String(warehouseId) === String(serial.currentWarehouseId)
      );

      if (!inScope) {
        const exception = await repositories.exceptionsRepo.createException({
          serialNo,
          ruleCode: "WRONG_WAREHOUSE",
          contextType: "BATTERY",
          contextId: invoiceId,
          warehouseId: serial.currentWarehouseId,
          raisedBy: userId,
          createdBy: userId
        });

        return {
          valid: false,
          status: null,
          alert: { ruleCode: "WRONG_WAREHOUSE", message: BATTERY_ALERTS.WRONG_WAREHOUSE },
          exception: {
            exceptionId: exception.exceptionId,
            ruleCode: exception.ruleCode,
            status: exception.status ?? "OPEN"
          }
        };
      }

      // Resolve the battery invoice line from the serial's product.
      const line = await repositories.batteryPreBilling.findBatteryLine(invoiceId, serial.productId);

      if (!line) {
        return {
          valid: false,
          status: null,
          alert: { ruleCode: "NOT_BATTERY_LINE", message: BATTERY_ALERTS.NOT_BATTERY_LINE }
        };
      }

      const existing = await repositories.batteryPreBilling.findCommitBySerial(serial.serialId);

      if (existing) {
        return {
          valid: false,
          status: null,
          alert: { ruleCode: "ALREADY_COMMITTED", message: BATTERY_ALERTS.ALREADY_COMMITTED }
        };
      }

      // Cap pre-billing to the invoice line quantity — you cannot commit more
      // battery units than the invoice requires for that line.
      if (line.requiredQuantity != null && repositories.batteryPreBilling.countCommitsForLine) {
        const committedForLine = await repositories.batteryPreBilling.countCommitsForLine(line.invoiceLineId);
        if (committedForLine >= Number(line.requiredQuantity)) {
          return {
            valid: false,
            status: null,
            alert: { ruleCode: "BATTERY_QUANTITY_REACHED", message: BATTERY_ALERTS.QUANTITY_REACHED }
          };
        }
      }

      return await repositories.withTransaction(async (txRepos) => {
        await txRepos.batteryPreBilling.insertCommit({
          invoiceLineId: line.invoiceLineId,
          serialId: serial.serialId,
          committedBy: userId,
          createdBy: userId
        });

        await txRepos.serials.appendSerialEvent({
          serialId: serial.serialId,
          eventType: "PRE_BILLING",
          warehouseId: serial.currentWarehouseId,
          referenceType: "INVOICE_LINE",
          referenceId: line.invoiceLineId,
          createdBy: userId
        });

        return { valid: true, status: "COMMITTED", serial: validation.serial };
      });
    },

    async getCommitStatus({ invoiceId }) {
      const invoice = await repositories.invoices.findById(invoiceId);

      if (!invoice) {
        throw Object.assign(new Error("Invoice not found"), { status: 404 });
      }

      const committedQuantity = await repositories.batteryPreBilling.countCommitsForInvoice(invoiceId);

      return { invoiceId, committedQuantity };
    }
  };
}
