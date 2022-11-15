/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { CSVFileLogger } from "./csvFileLogger";
import { IFileLogger, ITelemetryOptions, OutputFormat } from "./fileLogger";
import { JSONFileLogger } from "./jsonFileLogger";

/**
 * Create a ITelemetryLogger wrapped around provided IFileLogger
 * ! It is expected that all events be sent through the returned "logger" value
 * ! The "fileLogger" value should have its "close()" method called at the end of execution
 * Note: if an output format is not supplied, default is JSON
 * @returns - both the IFileLogger implementation and ITelemetryLogger wrapper to be called
 */
 export function createLogger(
    filePath: string,
    options?: ITelemetryOptions,
): { logger: ITelemetryLogger; fileLogger: IFileLogger; } {
    const fileLogger = options?.outputFormat === OutputFormat.CSV
        ? new CSVFileLogger(filePath, options?.eventsPerFlush, options?.defaultProps)
        : new JSONFileLogger(filePath, options?.eventsPerFlush, options?.defaultProps);

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

/**
 * Validate the provided output format and default properties
 * @param format - desired output format of the telemetry
 * @param props - default properties to be added to every telemetry entry
 * @internal
 */
export function validateAndParseTelemetryOptions(
    format?: string,
    props?: (string | number)[],
): { success: false; error: string; } | { success: true; telemetryOptions: ITelemetryOptions; } {
    let outputFormat: OutputFormat | undefined;
    const defaultProps: Record<string, string | number> = {};

    if (format) {
        outputFormat = OutputFormat[format];
        if (outputFormat === undefined) {
            return { success: false, error: `Invalid telemetry format [${format}]` };
        }
    }

    if (props && props.length > 0) {
        if (props.length % 2 !== 0) {
            return { success: false, error: `Invalid number of telemetry properties to add [${props.length}]` };
        }
        for (let i = 0; i < props.length; i += 2) {
            if (typeof props[i] === "number") {
                return { success: false, error: `Property name cannot be number at index [${i}] -> [${props[i]}]` };
            }
            defaultProps[props[i]] = props[i + 1];
        }
    }

    return { success: true, telemetryOptions: { outputFormat, defaultProps } };
}
