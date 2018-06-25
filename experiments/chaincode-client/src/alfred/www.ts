import * as utils from "@prague/routerlicious/dist/utils";
import * as nconf from "nconf";
import * as path from "path";
import * as winston from "winston";
import { AlfredResourcesFactory, AlfredRunnerFactory } from "./runnerFactory";

const configFile = path.join(__dirname, "../../config.json");
const config = nconf.argv().env("__" as any).file(configFile).use("memory");
const logConfig = config.get("logger");

// Configure default winston logger
winston.configure({
    transports: [
        new winston.transports.Console({
            colorize: logConfig.colorize,
            handleExceptions: true,
            json: logConfig.json,
            label: logConfig.label,
            level: logConfig.level,
            stringify: (obj) => JSON.stringify(obj),
            timestamp: logConfig.timestamp,
        } as any),
    ],
});

utils.run(config, new AlfredResourcesFactory(), new AlfredRunnerFactory());
