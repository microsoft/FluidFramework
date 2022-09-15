/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { BaseFileLogger } from "./FileLogger";

export class JSONFileLogger extends BaseFileLogger {
    constructor(
        filePath: string,
        eventsPerFlush: number = 50,
        defaultFields?: Record<string, string>,
    ) {
        super(filePath, eventsPerFlush, defaultFields);
        fs.appendFileSync(this.filePath, "[");
    }

    public async flush(): Promise<void> {
        return super.flushCore(this.filePath, ",");
    }

    public async close(): Promise<void> {
        fs.appendFileSync(this.filePath, "]");
    }
}
