/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILumberjackEngine, LogLevel, Lumber, LumberType } from "@fluidframework/server-services-telemetry";
import winston from "winston";

export class WinstonLumberjack implements ILumberjackEngine {
    public emit(lumber: Lumber) {
        const propObj: { [key: string]: any } = {};
        lumber.properties.forEach((value, key) => { propObj[key] = value; });
        const obj = {
            timestamp: lumber.timestamp,
            eventName: lumber.eventName,
            metadata: lumber.metadata,
            type: LumberType[lumber.type],
            successful: lumber.successful,
            message: lumber.message,
            statusCode: lumber.statusCode,
            latencyInMs: lumber.latencyInMs,
            properties: propObj,
            exception: lumber.exception,
        };

        const level = this.getLogLevelToWinstonMapping(lumber.logLevel);
        const message = lumber.message ?? "No message provided.";

        winston.log(level, message, obj);
    }

    private getLogLevelToWinstonMapping(level: LogLevel | undefined) {
        switch (level) {
            case LogLevel.Error:
                return "error";
            case LogLevel.Warning:
                return "warn";
            case LogLevel.Info:
                return "info";
            case LogLevel.Verbose:
                return "verbose";
            case LogLevel.Debug:
                return "debug";
            default:
                return "info";
        }
    }
}
