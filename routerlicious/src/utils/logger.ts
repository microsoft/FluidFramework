import * as debug from "debug";
import * as nconf from "nconf";
import split = require("split");
import * as winston from "winston";
import * as utils from "../utils";

const loggerConfig = nconf.get("logger");

/**
 * Default logger setup
 */
// TODO don't take dependency on nconf
export let logger: winston.LoggerInstance = winston.default;
if (loggerConfig) {
    logger = new winston.Logger({
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
}

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to (re: Morgan)
 */
export const stream = split().on("data", (message) => {
  logger.info(message);
});

(<any> debug).log = (msg, ...args) => logger.info(msg, ...args);
// override the default log format to not include the timestamp since winston will do this for us
// tslint:disable-next-line:only-arrow-functions
(<any> debug).formatArgs = function(args) {
    const name = this.namespace;
    args[0] = name + " " + args[0];
};
