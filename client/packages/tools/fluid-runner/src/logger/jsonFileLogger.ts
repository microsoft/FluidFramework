/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { BaseFileLogger } from "./baseFileLogger";

/**
 * FileLogger that writes events into a defined CSV file
 * @internal
 */
export class JSONFileLogger extends BaseFileLogger {
    constructor(
        filePath: string,
        eventsPerFlush: number = 50,
        defaultProps?: Record<string, string | number>,
    ) {
        super(filePath, eventsPerFlush, defaultProps);
        fs.appendFileSync(this.filePath, "[");
    }

    public async close(): Promise<void> {
        await super.close();
        fs.appendFileSync(this.filePath, "]");
    }
}
