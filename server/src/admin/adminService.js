import { createWarehouseService } from "./adminService/warehouses.js";
import { createRoleService } from "./adminService/roles.js";
import { createMemberService } from "./adminService/members.js";
import { createProductService } from "./adminService/products.js";
import { createInvoiceService } from "./adminService/invoices.js";
import { createInboundDispatchService } from "./adminService/inboundDispatches.js";

export function createAdminService({ repositories, adminRepo }) {
  return {
    ...createWarehouseService({ adminRepo }),
    ...createRoleService({ repositories, adminRepo }),
    ...createMemberService({ repositories, adminRepo }),
    ...createProductService({ adminRepo }),
    ...createInvoiceService({ adminRepo }),
    ...createInboundDispatchService({ adminRepo })
  };
}
