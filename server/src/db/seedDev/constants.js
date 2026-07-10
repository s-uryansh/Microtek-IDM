export const createdBy = "SEED";
export const defaultAdminPasswordHash = "$2b$12$tPMbnZMIwpdRNkm6EBsNpu6eYbK0E5ivwJAF.zCDdlGkwtNaRd/F6";
export const defaultSupervisorPasswordHash = "$2b$12$tPMbnZMIwpdRNkm6EBsNpu6eYbK0E5ivwJAF.zCDdlGkwtNaRd/F6";
export const defaultOperatorPasswordHash = "$2b$12$tPMbnZMIwpdRNkm6EBsNpu6eYbK0E5ivwJAF.zCDdlGkwtNaRd/F6";

export function assertNonProduction(config) {
  if (config.nodeEnv === "production" || /prod/i.test(config.databaseUrl)) {
    throw new Error("Refusing to run development seed against a production-looking environment");
  }
}

export async function upsertOne(client, sql, values) {
  const result = await client.query(sql, values);
  return result.rows[0];
}

export async function refreshAgeingSnapshot(client) {
  await client.query("REFRESH MATERIALIZED VIEW ageing_serial_snapshot");
}
