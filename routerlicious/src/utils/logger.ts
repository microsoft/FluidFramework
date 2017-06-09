import split = require("split");
import * as winston from "winston";

/**
 * Default logger setup
 */
export const logger = new winston.Logger({
    transports: [
        new winston.transports.Console({
            colorize: true,
            handleExceptions: true,
            json: false,
            level: "info",
        }),
    ],
});

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to (re: Morgan)
 */
export const stream = split().on("data", (message) => {
  logger.info(message);
});
