// Shared guard: refuse any stock-mutating operation targeting a deactivated
// warehouse. A warehouse is "deleted" via soft-deactivation (is_active = false,
// see adminService/warehouses.js). Once inactive it must not accept any new
// stock activity — GRN, dispatch, warehouse transfer, SRN, receipt scans — even
// though its history and reports stay readable.
//
// Takes the composed `repositories` (which exposes admin.getWarehouseById via
// createAdminRepository) so it works both outside and inside a withTransaction
// block, where a fresh repositories set is rebound to the transaction client.
export async function assertWarehouseActive(repositories, warehouseId, label = "warehouse") {
  if (warehouseId === null || warehouseId === undefined) {
    return null;
  }
  if (!repositories.admin?.getWarehouseById) {
    return null;
  }

  const warehouse = await repositories.admin.getWarehouseById(warehouseId);

  if (!warehouse) {
    throw Object.assign(new Error(`The ${label} was not found.`), {
      status: 404,
      code: "WAREHOUSE_NOT_FOUND",
      warehouseId: Number(warehouseId)
    });
  }

  if (!warehouse.isActive) {
    throw Object.assign(
      new Error(
        `The ${label} "${warehouse.name ?? warehouse.code ?? warehouseId}" is deactivated and cannot accept stock activity.`
      ),
      {
        status: 409,
        code: "WAREHOUSE_INACTIVE",
        warehouseId: Number(warehouseId)
      }
    );
  }

  return warehouse;
}
