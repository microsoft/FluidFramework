/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";

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
