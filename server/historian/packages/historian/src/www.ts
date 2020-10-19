/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import * as debug from "debug";
import * as nconf from "nconf";
import * as winston from "winston";
import { runService } from "@fluidframework/server-services-utils";
import { HistorianResourcesFactory, HistorianRunnerFactory } from "@fluidframework/historian-base";

const provider = nconf.argv().env("__" as any).file(path.join(__dirname, "../config.json")).use("memory");

/**
 * Default logger setup
 */
const loggerConfig = provider.get("logger");
winston.configure({
    transports: [
        new winston.transports.Console({
            colorize: loggerConfig.colorize,
            handleExceptions: true,
            json: loggerConfig.json,
            level: loggerConfig.level,
            stringify: (obj) => JSON.stringify(obj),
            timestamp: loggerConfig.timestamp,
        }),
    ],
});

// Update debug library to output to winston
(debug as any).log = (msg, ...args) => winston.info(msg, ...args);
// override the default log format to not include the timestamp since winston will do this for us
// tslint:disable-next-line:only-arrow-functions
(debug as any).formatArgs = function(args) {
    const name = this.namespace;
    args[0] = `${name  } ${  args[0]}`;
};

runService(
    new HistorianResourcesFactory(),
    new HistorianRunnerFactory(),
    "historian",
    provider);
