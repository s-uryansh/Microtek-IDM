const VALID_WAREHOUSE_TYPES = ["PLANT", "CENTRAL", "REGIONAL"];

export function createWarehouseService({ adminRepo }) {
  return {
    /*
       WAREHOUSES
*/

    async listWarehouseStock() {
      return adminRepo.listWarehouseStock();
    },

    async listWarehouses() {
      return adminRepo.listWarehouses();
    },

    async createWarehouse({ code, name, type, userId }) {
      if (!code || !code.trim()) {
        throw Object.assign(new Error("Warehouse code is required"), { status: 400 });
      }
      if (!name || !name.trim()) {
        throw Object.assign(new Error("Warehouse name is required"), { status: 400 });
      }
      if (!VALID_WAREHOUSE_TYPES.includes(type)) {
        throw Object.assign(
          new Error(`Warehouse type must be one of: ${VALID_WAREHOUSE_TYPES.join(", ")}`),
          { status: 400 }
        );
      }

      return adminRepo.createWarehouse({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        type,
        createdBy: userId
      });
    },

    async deactivateWarehouse(warehouseId, userId) {
      const wh = await adminRepo.getWarehouseById(warehouseId);
      if (!wh) {
        throw Object.assign(new Error("Warehouse not found"), { status: 404 });
      }
      return adminRepo.toggleWarehouseActive(warehouseId, false, userId);
    },

    async reactivateWarehouse(warehouseId, userId) {
      const wh = await adminRepo.getWarehouseById(warehouseId);
      if (!wh) {
        throw Object.assign(new Error("Warehouse not found"), { status: 404 });
      }
      return adminRepo.toggleWarehouseActive(warehouseId, true, userId);
    }
  };
}
