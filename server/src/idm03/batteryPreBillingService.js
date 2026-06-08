const BATTERY_ALERTS = {
  NOT_BATTERY_LINE: "Invoice line is not a battery product.",
  PRODUCT_INVOICE_MISMATCH: "Serial product does not match the invoice line.",
  ALREADY_COMMITTED: "Serial is already committed to another invoice."
};

export function createBatteryPreBillingService({ repositories }) {
  async function checkInvoiceLine(invoiceLineId) {
    const line = await repositories.invoices.findLineById(invoiceLineId);

    if (!line) {
      throw Object.assign(new Error("Invoice line not found"), { status: 404 });
    }

    return line;
  }

  return {
    async getInvoiceWarehouseByLineId(invoiceLineId) {
      const line = await checkInvoiceLine(invoiceLineId);
      return line.warehouseId;
    },

    async commitSerial({ invoiceLineId, serialNo, userId }) {
      const line = await checkInvoiceLine(invoiceLineId);

      if (!line.isBattery) {
        return {
          valid: false,
          status: null,
          alert: { ruleCode: "NOT_BATTERY_LINE", message: BATTERY_ALERTS.NOT_BATTERY_LINE }
        };
      }

      const validation = await repositories.validationService.validateSerial({
        serialNo,
        contextType: "BATTERY",
        contextId: invoiceLineId,
        warehouseId: line.warehouseId,
        expectedProductId: line.productId,
        userId
      });

      if (!validation.valid) {
        return validation;
      }

      const serial = validation.serial;
      const existing = await repositories.batteryPreBilling.findCommitBySerial(serial.serialId);

      if (existing) {
        return {
          valid: false,
          status: null,
          alert: { ruleCode: "ALREADY_COMMITTED", message: BATTERY_ALERTS.ALREADY_COMMITTED }
        };
      }

      return await repositories.withTransaction(async (txRepos) => {
        await txRepos.batteryPreBilling.insertCommit({
          invoiceLineId,
          serialId: serial.serialId,
          committedBy: userId,
          createdBy: userId
        });

        await txRepos.serials.appendSerialEvent({
          serialId: serial.serialId,
          eventType: "PRE_BILLING",
          warehouseId: line.warehouseId,
          referenceType: "INVOICE_LINE",
          referenceId: invoiceLineId,
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

      return { invoiceId, warehouseId: invoice.warehouseId, committedQuantity };
    }
  };
}
