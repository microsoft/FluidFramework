/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { IFileLogger } from "./fileLogger";

/**
 * @internal
 */
export abstract class BaseFileLogger implements IFileLogger {
    public supportsTags?: true | undefined;

    /** Hold events in memory until flushed */
    protected events: any[] = [];
    protected hasWrittenToFile = false;

    /**
     * @param filePath - file path to write logs to
     * @param eventsPerFlush - number of events per flush
     * @param defaultProps - default properties to add to every telemetry event
     */
     public constructor(
        protected readonly filePath: string,
        protected readonly eventsPerFlush: number = 50,
        protected readonly defaultProps?: Record<string, string | number>,
    ) { }

    public send(event: ITelemetryBaseEvent): void {
        // eslint-disable-next-line no-param-reassign
        event = { ...event, ...this.defaultProps };
        this.events.push(event);

        if (this.events.length >= this.eventsPerFlush || event.category === "error") {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.flush();
        }
    }

    protected async flush(): Promise<void> {
        if (this.events.length > 0) {
            const contentToWrite = this.events.map((it) => JSON.stringify(it)).join(",");
            if (this.hasWrittenToFile) {
                fs.appendFileSync(this.filePath, `,${contentToWrite}`);
            } else {
                fs.appendFileSync(this.filePath, contentToWrite);
            }
            this.events = [];
            this.hasWrittenToFile = true;
        }
    }

    public async close(): Promise<void> {
        await this.flush();
    }
}
