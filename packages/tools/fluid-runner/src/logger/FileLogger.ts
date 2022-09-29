/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { ITelemetryBaseEvent, ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";

/**
 * Logger that writes events into a defined file
 */
export class FileLogger implements ITelemetryBaseLogger {
    public supportsTags?: true | undefined;

    /** Hold events in memory until flushed */
    private events: string[] = [];

    /**
     * @param filePath - file path to write logs to
     * @param eventsPerFlush - number of events per flush
     */
    public constructor(
        private readonly filePath: string,
        private readonly eventsPerFlush: number = 50,
    ) { }

    public async flush(): Promise<void> {
        if (this.events.length > 0) {
            fs.appendFileSync(this.filePath, this.events.join("\n"));
            this.events = [];
        }
    }

    public send(event: ITelemetryBaseEvent): void {
        const logEvent = JSON.stringify(event);

        this.events.push(logEvent);

        if (this.events.length >= this.eventsPerFlush || event.category === "error") {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.flush();
        }
    }
}

/**
 * Create a ITelemetryLogger wrapped around provided FileLogger
 */
export function createLogger(fileLogger: FileLogger): ITelemetryLogger {
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
