/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { CSVFileLogger } from "./csvFileLogger";
import { JSONFileLogger } from "./jsonFileLogger";

/**
 * TODO
 */
export interface IFileLogger extends ITelemetryBaseLogger {
    close(): Promise<void>;
}

// TODO: need to pass through layers
export enum OutputFormat {
    JSON,
    CSV,
}

// TODO
export interface ITelemetryOptions {
    outputFormat?: OutputFormat;
    defaultFields?: Record<string, string>; // TODO: need to pass through layers
    eventsPerFlush?: number;
}

/**
 * Create a ITelemetryLogger wrapped around provided IFileLogger
 * TODO
 */
export function createLogger(
    filePath: string,
    options?: ITelemetryOptions,
): { logger: ITelemetryLogger; fileLogger: IFileLogger; } {
    const fileLogger = options?.outputFormat === OutputFormat.CSV
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

// TODO
export function validateAndParseTelemetryOptions(
    format?: string,
    props?: string,
): { success: false; error: string; } | { success: true; telemetryOptions: ITelemetryOptions; } {
    let outputFormat: OutputFormat | undefined;
    const defaultFields: Record<string, string> = {};

    if (format) {
        outputFormat = OutputFormat[format];
        if (outputFormat === undefined) {
            return { success: false, error: `Invalid telemetry format [${format}]` };
        }
    }

    if (props) {
        let index = 0;
        for (const kvp of props.split(/\s+/)) {
            const kvpSplit = kvp.split("=");
            if (kvpSplit.length !== 2) {
                return { success: false, error: `Invalid property at index [${index}] -> [${kvp}]` };
            }
            defaultFields[kvpSplit[0]] = kvpSplit[1];
            index++;
        }
    }

    return { success: true, telemetryOptions: { outputFormat, defaultFields } };
}
