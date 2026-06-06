import pino from "pino";

export function createLogger(config) {
  return pino({
    level: config.logLevel,
    base: {
      service: "microtek-idm-api"
    }
  });
}
