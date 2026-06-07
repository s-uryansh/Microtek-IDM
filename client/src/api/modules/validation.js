import { post } from "../client.js";

export function validateSerial({ serialNo, contextType, warehouseId, expectedProductId, signal }) {
  return post(
    "/idm-06/validate",
    {
      serialNo,
      contextType,
      warehouseId,
      expectedProductId
    },
    { signal }
  );
}
