import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { startAgeingRefreshSchedule } from "./db/scheduleAgeingRefresh.js";
import { createLogger } from "./logger.js";

const config = loadConfig();
const logger = createLogger(config);
const app = createApp({ config, logger });

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, "Microtek IDM API listening");
  if (app.locals.pool) {
    startAgeingRefreshSchedule({
      pool: app.locals.pool,
      logger,
      intervalMs: config.ageingRefreshIntervalMs
    });
  }
});

export { server };
