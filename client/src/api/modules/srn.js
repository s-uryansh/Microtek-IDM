import { post } from "../client.js";

export function createSrn({ warehouseId, invoiceId, returnProductIds, expectedQuantity, allowsForeignStock, signal }) {
  return post(
    "/idm-04/srns",
    {
      warehouseId,
      invoiceId: invoiceId ? Number(invoiceId) : null,
      returnProductIds,
      expectedQuantity: expectedQuantity ? Number(expectedQuantity) : null,
      allowsForeignStock: allowsForeignStock === true
    },
    { signal }
  );
}

export function scanSrnSerial({ srnId, serialNo, conditionTag, productId, signal }) {
  return post(`/idm-04/srns/${srnId}/scans`, { serialNo, conditionTag, productId }, { signal });
}
