/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug } from "debug";
import * as winston from "winston";
import nconf from "nconf";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Transport = require("winston-transport");

export interface IWinstonConfig {
    colorize: boolean;
    json: boolean;
    label: string;
    level: string;
    timestamp: boolean;
    additionalTransportList: Transport[];
}

/**
 * Configures the default behavior of the Winston logger based on the provided config
 */
export function configureLogging(configOrPath: nconf.Provider | string) {
    const config = typeof configOrPath === "string"
        ? nconf.argv().env({ separator: "__", parseValues: true }).file(configOrPath).use("memory")
        : configOrPath;

    const winstonConfig = config.get("logger");

    const formatters = [winston.format.label({ label: winstonConfig.label })];

    if (winstonConfig.colorize) {
        formatters.push(winston.format.colorize());
    }

    if (winstonConfig.timestamp) {
        formatters.push(winston.format.timestamp());
    }

    if (winstonConfig.json) {
        formatters.push(winston.format.json());
    } else {
        formatters.push(winston.format.simple());
    }

    winston.configure({
        format: winston.format.combine(...formatters),
        transports: [
            new winston.transports.Console({
                handleExceptions: true,
                level: winstonConfig.level,
            }),
        ],
    });
    if (winstonConfig.additionalTransportList) {
        for (const transport of winstonConfig.additionalTransportList) {
            winston.add(transport);
        }
    }

    // Forward all debug library logs through winston
    (debug as any).log = (msg, ...args) => winston.info(msg, ...args);
    // Override the default log format to not include the timestamp since winston will do this for us
    (debug as any).formatArgs = function(args) {
        const name = this.namespace;
        args[0] = `${name} ${args[0]}`;
    };
}
