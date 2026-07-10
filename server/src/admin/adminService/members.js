import { hashPassword } from "../../auth/password.js";
import { normalizeText, normalizeIdList } from "./shared.js";

export function createMemberService({ repositories, adminRepo }) {
  return {
    /*
       MEMBERS
*/

    async listMembers({ query } = {}) {
      return adminRepo.listMembers({ query });
    },

    async getMemberById(userId) {
      return adminRepo.getMemberById(userId);
    },

    // Soft delete: mark the member as no longer with the company. They keep all
    // their history but can no longer log in (login checks is_active).
    async deactivateMember(userId, updatedBy) {
      const member = await adminRepo.getMemberById(userId);
      if (!member) {
        throw Object.assign(new Error("Member not found"), { status: 404 });
      }
      return adminRepo.toggleMemberActive(userId, false, updatedBy);
    },

    async reactivateMember(userId, updatedBy) {
      const member = await adminRepo.getMemberById(userId);
      if (!member) {
        throw Object.assign(new Error("Member not found"), { status: 404 });
      }
      return adminRepo.toggleMemberActive(userId, true, updatedBy);
    },

    async createMember({
      externalRef,
      username,
      displayName,
      password,
      roleId,
      defaultWarehouseId,
      warehouseIds,
      isActive = true,
      userId
    }) {
      const normalizedUsername = normalizeText(username);
      const normalizedDisplayName = normalizeText(displayName);
      const normalizedExternalRef = normalizeText(externalRef) || null;
      const normalizedWarehouses = normalizeIdList(warehouseIds);
      const normalizedDefaultWarehouseId = defaultWarehouseId ? Number(defaultWarehouseId) : null;

      if (!normalizedUsername) {
        throw Object.assign(new Error("Username is required"), { status: 400 });
      }
      if (!normalizedDisplayName) {
        throw Object.assign(new Error("Display name is required"), { status: 400 });
      }
      if (!roleId) {
        throw Object.assign(new Error("Role is required"), { status: 400 });
      }
      if (!normalizedDefaultWarehouseId) {
        throw Object.assign(new Error("Default warehouse is required"), { status: 400 });
      }
      if (!password || !String(password).trim()) {
        throw Object.assign(new Error("Password is required"), { status: 400 });
      }

      const resolvedWarehouseIds = normalizedWarehouses.length > 0
        ? normalizedWarehouses
        : normalizedDefaultWarehouseId
          ? [normalizedDefaultWarehouseId]
          : [];

      const passwordHash = await hashPassword(String(password));
      return repositories.withTransaction(async (txRepositories) =>
        txRepositories.admin.createMember({
          externalRef: normalizedExternalRef,
          username: normalizedUsername,
          displayName: normalizedDisplayName,
          passwordHash,
          roleId: Number(roleId),
          defaultWarehouseId: normalizedDefaultWarehouseId,
          warehouseIds: resolvedWarehouseIds,
          isActive,
          createdBy: userId
        })
      );
    },

    async updateMember({
      userId,
      externalRef,
      username,
      displayName,
      password,
      roleId,
      defaultWarehouseId,
      warehouseIds,
      isActive,
      updatedBy
    }) {
      const normalizedExternalRef = externalRef === undefined ? undefined : normalizeText(externalRef) || null;
      const normalizedUsername = username === undefined ? undefined : normalizeText(username);
      const normalizedDisplayName = displayName === undefined ? undefined : normalizeText(displayName);
      const normalizedWarehouses = warehouseIds === undefined ? undefined : normalizeIdList(warehouseIds);
      const normalizedDefaultWarehouseId = defaultWarehouseId === undefined ? undefined : (defaultWarehouseId ? Number(defaultWarehouseId) : null);

      if (normalizedUsername !== undefined && !normalizedUsername) {
        throw Object.assign(new Error("Username is required"), { status: 400 });
      }
      if (normalizedDisplayName !== undefined && !normalizedDisplayName) {
        throw Object.assign(new Error("Display name is required"), { status: 400 });
      }

      const passwordHash = password ? await hashPassword(String(password)) : undefined;

      if (normalizedDefaultWarehouseId === null && Array.isArray(normalizedWarehouses) && normalizedWarehouses.length === 0) {
        throw Object.assign(new Error("Default warehouse is required"), { status: 400 });
      }

      return repositories.withTransaction(async (txRepositories) => {
        const member = await txRepositories.admin.getMemberById(userId);
        if (!member) {
          throw Object.assign(new Error("Member not found"), { status: 404 });
        }

        const resolvedWarehouseIds = normalizedWarehouses === undefined
          ? undefined
          : normalizedWarehouses.length > 0
            ? normalizedWarehouses
            : normalizedDefaultWarehouseId
              ? [normalizedDefaultWarehouseId]
              : [];

        return txRepositories.admin.updateMember({
          userId,
          externalRef: normalizedExternalRef,
          username: normalizedUsername,
          displayName: normalizedDisplayName,
          passwordHash,
          roleId: roleId === undefined ? undefined : Number(roleId),
          defaultWarehouseId: normalizedDefaultWarehouseId,
          warehouseIds: resolvedWarehouseIds,
          isActive,
          updatedBy
        });
      });
    }
  };
}
