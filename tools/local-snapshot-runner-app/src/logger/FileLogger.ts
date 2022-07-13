/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";

/**
 * TODO: Look at FileLogger class in stress tests
 */
export default class FileLogger implements ITelemetryBaseLogger {
    public supportsTags?: true | undefined;

    public constructor(
        private readonly fileName: string,
    ) { }

    /**
     * Appending each line to file right away for now
     * @param event - TODO
     */
    public send(event: ITelemetryBaseEvent): void {
        const logEvent = JSON.stringify(event);
        console.log(logEvent);

        fs.appendFileSync(this.fileName, `${logEvent}\n`);
    }
}
