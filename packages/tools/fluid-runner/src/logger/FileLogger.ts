/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { ITelemetryBaseEvent, ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
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

export function createFileLogger(
    filePath: string,
    outputFormat: OutputFormat = OutputFormat.JSON,
    options?: ITelemetryOptions,
): IFileLogger {
    if (outputFormat === OutputFormat.CSV) {
        return new CSVFileLogger(filePath, options?.eventsPerFlush);
    }
    return new JSONFileLogger(filePath, options?.eventsPerFlush);
}

/**
 * Create a ITelemetryLogger wrapped around provided IFileLogger
 */
export function createLogger(fileLogger: IFileLogger): ITelemetryLogger {
    return ChildLogger.create(fileLogger, "LocalSnapshotRunnerApp",
        { all: { Event_Time: () => Date.now() } });
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

// TODO: be strict about FileLogger.ts exports
export abstract class BaseFileLogger implements IFileLogger {
    public supportsTags?: true | undefined;

    /** Hold events in memory until flushed */
    protected events: string[] = [];
    protected hasWrittenToFile = false;

    /**
     * @param filePath - file path to write logs to
     * @param eventsPerFlush - number of events per flush
     * @param defaultFields - TODO
     */
     public constructor(
        protected readonly filePath: string,
        protected readonly eventsPerFlush: number = 50,
        protected readonly defaultFields?: Record<string, string>,
    ) { }

    public send(event: ITelemetryBaseEvent): void {
        // eslint-disable-next-line no-param-reassign
        event = { ...event, ...this.defaultFields };
        const logEvent = JSON.stringify(event);
        this.events.push(logEvent);

        if (this.events.length >= this.eventsPerFlush || event.category === "error") {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.flush();
        }
    }

    public abstract close(): Promise<void>;
    public abstract flush(): Promise<void>;

    protected async flushCore(outputPath: string, delimitter: string): Promise<void> {
        if (this.events.length > 0) {
            if (this.hasWrittenToFile) {
                fs.appendFileSync(outputPath, delimitter + this.events.join(delimitter));
            } else {
                fs.appendFileSync(outputPath, this.events.join(delimitter));
            }
            this.events = [];
            this.hasWrittenToFile = true;
        }
    }
}
