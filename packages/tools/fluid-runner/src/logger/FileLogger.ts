/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { CSVFileLogger } from "./csvFileLogger";
import { JSONFileLogger } from "./jsonFileLogger";

export interface IFileLogger extends ITelemetryBaseLogger {
    flush(): Promise<void>;
    close(): Promise<void>;
}

// TODO: need to pass through layers
export enum OutputFormat {
    JSON,
    CSV,
}

export interface ITelemetryOptions {
    defaultFields?: Record<string, string>; // TODO: need to pass through layers
    eventsPerFlush?: number;
}

/**
 * Create a ITelemetryLogger wrapped around provided IFileLogger
 * TODO
 */
export function createLogger(
    filePath: string,
    outputFormat: OutputFormat = OutputFormat.JSON,
    options?: ITelemetryOptions,
): { logger: ITelemetryLogger; fileLogger: IFileLogger; } {
    const fileLogger = outputFormat === OutputFormat.CSV
        ? new CSVFileLogger(filePath, options?.eventsPerFlush, options?.defaultFields)
        : new JSONFileLogger(filePath, options?.eventsPerFlush, options?.defaultFields);

    const logger = ChildLogger.create(fileLogger, "LocalSnapshotRunnerApp",
        { all: { Event_Time: () => Date.now() } });

    return { logger, fileLogger };
}

/**
 * Validate the telemetryFile command line argument
 * @param telemetryFile - path where telemetry will be written
 */
export function getTelemetryFileValidationError(telemetryFile: string): string | undefined {
    if (!telemetryFile) {
        return "Telemetry file argument is missing.";
    } else if (fs.existsSync(telemetryFile)) {
        return `Telemetry file already exists [${telemetryFile}].`;
    }

    return undefined;
}
