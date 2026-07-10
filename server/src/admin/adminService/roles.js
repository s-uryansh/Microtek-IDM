import { availablePermissionCodes } from "../../security/rbacPolicy.js";
import { normalizeText, normalizePermissionCodes } from "./shared.js";

export function createRoleService({ repositories, adminRepo }) {
  return {
    /*
       ROLES
*/

    async listRoles() {
      return adminRepo.listRoles();
    },

    async listPermissionCodes() {
      return availablePermissionCodes;
    },

    async createRole({ code, name, permissionCodes = [], userId }) {
      const normalizedCode = normalizeText(code).toLowerCase();
      const normalizedName = normalizeText(name);
      const permissions = normalizePermissionCodes(permissionCodes);

      if (!normalizedCode) {
        throw Object.assign(new Error("Role code is required"), { status: 400 });
      }
      if (!normalizedName) {
        throw Object.assign(new Error("Role name is required"), { status: 400 });
      }

      for (const permissionCode of permissions) {
        if (!availablePermissionCodes.includes(permissionCode)) {
          throw Object.assign(new Error(`Unknown permission: ${permissionCode}`), { status: 400 });
        }
      }

      return repositories.withTransaction(async (txRepositories) =>
        txRepositories.admin.createRole({
          code: normalizedCode,
          name: normalizedName,
          permissionCodes: permissions,
          createdBy: userId
        })
      );
    },

    async updateRole({ roleId, name, isActive, permissionCodes, userId }) {
      const normalizedName = name === undefined ? undefined : normalizeText(name);
      const permissions = permissionCodes === undefined ? undefined : normalizePermissionCodes(permissionCodes);

      if (normalizedName !== undefined && !normalizedName) {
        throw Object.assign(new Error("Role name is required"), { status: 400 });
      }

      if (Array.isArray(permissions)) {
        for (const permissionCode of permissions) {
          if (!availablePermissionCodes.includes(permissionCode)) {
            throw Object.assign(new Error(`Unknown permission: ${permissionCode}`), { status: 400 });
          }
        }
      }

      return repositories.withTransaction(async (txRepositories) => {
        const role = await txRepositories.admin.getRoleById(roleId);
        if (!role) {
          throw Object.assign(new Error("Role not found"), { status: 404 });
        }

        return txRepositories.admin.updateRole({
          roleId,
          name: normalizedName,
          isActive,
          permissionCodes: permissions,
          updatedBy: userId
        });
      });
    }
  };
}
