import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

import { loadConfig } from "../config.js";
import { createLogger } from "../logger.js";

const migrationsDir = resolve(import.meta.dirname, "../../../db/migrations");

function listMigrations() {
  return readdirSync(migrationsDir)
    .filter((fileName) => /^V\d+__.+\.sql$/.test(fileName))
    .sort();
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(20) PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function hasMigration(client, version) {
  const result = await client.query("SELECT 1 FROM schema_migrations WHERE version = $1", [version]);
  return result.rowCount > 0;
}

async function applyMigration(client, fileName) {
  const [version, nameWithExtension] = fileName.split("__");
  const name = nameWithExtension.replace(/\.sql$/, "");

  if (await hasMigration(client, version)) {
    return false;
  }

  const sql = readFileSync(resolve(migrationsDir, fileName), "utf8");

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)", [version, name]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function runMigrations({ databaseUrl, logger }) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await ensureMigrationTable(client);

    for (const fileName of listMigrations()) {
      const applied = await applyMigration(client, fileName);
      logger.info({ migration: fileName, applied }, "Migration checked");
    }
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const logger = createLogger(config);

  runMigrations({ databaseUrl: config.databaseUrl, logger }).catch((error) => {
    logger.error({ error }, "Migration failed");
    process.exitCode = 1;
  });
}
