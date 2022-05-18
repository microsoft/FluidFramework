/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug } from "debug";
import * as winston from "winston";
import nconf from "nconf";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Transport = require("winston-transport");
import { ILumberjackEngine, ILumberjackSchemaValidator, Lumberjack } from "@fluidframework/server-services-telemetry";
import { WinstonLumberjackEngine } from "./winstonLumberjackEngine";

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

    const lumberjackConfig = config.get("lumberjack");
    const engineList =
        // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
        lumberjackConfig && lumberjackConfig.engineList ?
        lumberjackConfig.engineList as ILumberjackEngine[] :
        [new WinstonLumberjackEngine()];

    const schemaValidatorList =
        // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
        lumberjackConfig && lumberjackConfig.schemaValidator ?
        lumberjackConfig.schemaValidator as ILumberjackSchemaValidator[] :
        undefined;

    Lumberjack.setup(engineList, schemaValidatorList);

    // Forward all debug library logs through winston and Lumberjack
    (debug as any).log = function(msg, ...args) {
        winston.info(msg, ...args);
        Lumberjack.info(msg, { args: JSON.stringify(args) });
    };
    // Override the default log format to not include the timestamp since winston and Lumberjack will do this for us
    (debug as any).formatArgs = function(args) {
        const name = this.namespace;
        args[0] = `${name} ${args[0]}`;
    };
}
