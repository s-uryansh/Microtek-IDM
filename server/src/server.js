import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";

const config = loadConfig();
const logger = createLogger(config);
const app = createApp({ config, logger });

app.listen(config.port, () => {
  logger.info({ port: config.port }, "Microtek IDM API listening");
});
