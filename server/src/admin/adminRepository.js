import { createWarehouseRepository } from "./adminRepository/warehouses.js";
import { createRoleRepository } from "./adminRepository/roles.js";
import { createMemberRepository } from "./adminRepository/members.js";
import { createProductRepository } from "./adminRepository/products.js";
import { createInvoiceAdminRepository } from "./adminRepository/invoices.js";
import { createSapDispatchDocRepository } from "./adminRepository/sapDispatchDocs.js";

export function createAdminRepository(pool) {
  return {
    ...createWarehouseRepository(pool),
    ...createRoleRepository(pool),
    ...createMemberRepository(pool),
    ...createProductRepository(pool),
    ...createInvoiceAdminRepository(pool),
    ...createSapDispatchDocRepository(pool)
  };
}
