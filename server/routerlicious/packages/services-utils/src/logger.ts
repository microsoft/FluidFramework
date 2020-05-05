/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as debug from "debug";
import * as winston from "winston";

export interface IWinstonConfig {
    colorize: boolean;
    json: boolean;
    label: string;
    level: string;
    timestamp: boolean;
}

/**
 * Configures the default behavior of the Winston logger based on the provided config
 */
export function configureLogging(config: IWinstonConfig) {
    const formatters = [winston.format.label({ label: config.label })];

    if (config.colorize) {
        formatters.push(winston.format.colorize());
    }

    if (config.timestamp) {
        formatters.push(winston.format.timestamp());
    }

    if (config.json) {
        formatters.push(winston.format.json());
    } else {
        formatters.push(winston.format.simple());
    }

    winston.configure({
        format: winston.format.combine(...formatters),
        transports: [
            new winston.transports.Console({
                handleExceptions: true,
                level: config.level,
            }),
        ],
    });

    // Forward all debug library logs through winston
    (debug as any).log = (msg, ...args) => winston.info(msg, ...args);
    // Override the default log format to not include the timestamp since winston will do this for us
    // eslint-disable-next-line space-before-function-paren
    (debug as any).formatArgs = function (args) {
        const name = this.namespace;
        args[0] = `${name} ${args[0]}`;
    };
}
