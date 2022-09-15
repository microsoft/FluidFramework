/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { IFileLogger } from "./FileLogger";

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
