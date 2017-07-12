import * as nconf from "nconf";
import split = require("split");
import * as winston from "winston";
import * as utils from "./utils";

const loggerConfig = nconf.get("logger");

/**
 * Default logger setup
 */
export const logger = new winston.Logger({
    transports: [
        new winston.transports.Console({
            colorize: utils.parseBoolean(loggerConfig.colorize),
            handleExceptions: true,
            json: utils.parseBoolean(loggerConfig.json),
            level: loggerConfig.level,
            stringify: (obj) => JSON.stringify(obj),
            timestamp: utils.parseBoolean(loggerConfig.timestamp),
        }),
    ],
});

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to (re: Morgan)
 */
export const stream = split().on("data", (message) => {
  logger.info(message);
});
