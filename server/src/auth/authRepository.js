import { createHash } from "node:crypto";

function sessionHash(sessionId) {
  return createHash("sha256").update(sessionId).digest("hex");
}

function mapUser(row) {
  if (!row) return null;
  return {
    userId: String(row.userId),
    username: row.username,
    displayName: row.displayName,
    passwordHash: row.passwordHash,
    role: row.role,
    isActive: row.isActive,
    failedLoginCount: row.failedLoginCount,
    lockedUntil: row.lockedUntil,
    defaultWarehouseId: row.defaultWarehouseId ?? null,
    warehouseIds: row.warehouseIds?.map((id) => Number(id)).filter(Number.isInteger) ?? []
  };
}

export function createAuthRepository(pool) {
  return {
    async findByUsername(username) {
      const result = await pool.query(
        `SELECT
          au.app_user_id AS "userId",
          au.username,
          au.display_name AS "displayName",
          au.password_hash AS "passwordHash",
          au.is_active AS "isActive",
          au.failed_login_count AS "failedLoginCount",
          au.locked_until AS "lockedUntil",
          au.default_warehouse_id AS "defaultWarehouseId",
          r.code AS role,
          COALESCE(array_agg(auw.warehouse_id) FILTER (WHERE auw.warehouse_id IS NOT NULL), '{}') AS "warehouseIds"
         FROM app_user au
         JOIN role r ON r.role_id = au.role_id
         LEFT JOIN app_user_warehouse auw ON auw.app_user_id = au.app_user_id
         WHERE lower(au.username) = lower($1)
         GROUP BY au.app_user_id, r.code`,
        [username]
      );

      return mapUser(result.rows[0]);
    },

    async findById(userId) {
      const result = await pool.query(
        `SELECT
          au.app_user_id AS "userId",
          au.username,
          au.display_name AS "displayName",
          au.password_hash AS "passwordHash",
          au.is_active AS "isActive",
          au.failed_login_count AS "failedLoginCount",
          au.locked_until AS "lockedUntil",
          au.default_warehouse_id AS "defaultWarehouseId",
          r.code AS role,
          COALESCE(array_agg(auw.warehouse_id) FILTER (WHERE auw.warehouse_id IS NOT NULL), '{}') AS "warehouseIds"
         FROM app_user au
         JOIN role r ON r.role_id = au.role_id
         LEFT JOIN app_user_warehouse auw ON auw.app_user_id = au.app_user_id
         WHERE au.app_user_id = $1
         GROUP BY au.app_user_id, r.code`,
        [userId]
      );

      return mapUser(result.rows[0]);
    },

    async recordFailedLogin(userId, { maxFailedLogins, lockoutMs }) {
      await pool.query(
        `UPDATE app_user
         SET failed_login_count = failed_login_count + 1,
             locked_until = CASE
               WHEN failed_login_count + 1 >= $2 THEN now() + ($3 || ' milliseconds')::interval
               ELSE locked_until
             END,
             updated_at = now(),
             updated_by = 'AUTH'
         WHERE app_user_id = $1`,
        [userId, maxFailedLogins, lockoutMs]
      );
    },

    async recordSuccessfulLogin(userId) {
      await pool.query(
        `UPDATE app_user
         SET failed_login_count = 0,
             locked_until = NULL,
             last_login_at = now(),
             updated_at = now(),
             updated_by = 'AUTH'
         WHERE app_user_id = $1`,
        [userId]
      );
    },

    async createSession({ sessionId, userId, expiresAt, ipAddress, userAgent }) {
      const result = await pool.query(
        `INSERT INTO auth_session (
           session_id_hash,
           app_user_id,
           expires_at,
           ip_address,
           user_agent,
           created_by
         )
         VALUES ($1, $2, $3, $4, $5, 'AUTH')
         RETURNING auth_session_id AS "authSessionId"`,
        [sessionHash(sessionId), userId, expiresAt, ipAddress ?? null, userAgent ?? null]
      );

      return { sessionId, authSessionId: result.rows[0].authSessionId };
    },

    async findSession(sessionId) {
      const result = await pool.query(
        `SELECT
           auth_session_id AS "authSessionId",
           app_user_id AS "userId",
           expires_at AS "expiresAt",
           revoked_at AS "revokedAt"
         FROM auth_session
         WHERE session_id_hash = $1`,
        [sessionHash(sessionId)]
      );

      return result.rows[0] ?? null;
    },

    async revokeSession(sessionId) {
      await pool.query(
        `UPDATE auth_session
         SET revoked_at = now()
         WHERE session_id_hash = $1
           AND revoked_at IS NULL`,
        [sessionHash(sessionId)]
      );
    }
  };
}
