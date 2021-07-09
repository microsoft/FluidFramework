/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILumberjackEngine, LogLevel, Lumber, LumberType } from "@fluidframework/server-services-telemetry";
import winston from "winston";

// Lumberjack engine based on Winston. It processes the data
// captured in a Lumber instance and sends it through Winston.
export class WinstonLumberjackEngine implements ILumberjackEngine {
    public emit(lumber: Lumber<string>) {
        const propObj: { [key: string]: any } = {};
        lumber.properties.forEach((value, key) => { propObj[key] = value; });
        const obj = {
            eventName: lumber.eventName,
            id: lumber.id,
            properties: propObj,
            type: LumberType[lumber.type],
            timestamp: new Date(lumber.timestamp).toISOString(),
            durationInMs: lumber.durationInMs,
            successful: lumber.successful,
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
