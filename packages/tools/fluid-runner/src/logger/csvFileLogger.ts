/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import path from "path";
import readline from "readline";
import { v4 as uuidv4 } from "uuid";
import { AsyncParser } from "json2csv";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { BaseFileLogger } from "./baseFileLogger";

/**
 * FileLogger that writes events into a defined CSV file
 * @internal
 */
export class CSVFileLogger extends BaseFileLogger {
    /** Store the column names to write as the CSV header */
    private readonly columns = new Set();

    /** Store the telemetry in a temporary file to convert to CSV later */
    private readonly tempFile = path.join(__dirname, uuidv4());

    public async flush(): Promise<void> {
        return super.flushCore(this.tempFile, "\n");
    }

    public send(event: ITelemetryBaseEvent): void {
        // eslint-disable-next-line guard-for-in, no-restricted-syntax
        for (const prop in event) {
            this.columns.add(prop);
        }
        super.send(event);
    }

    public async close(): Promise<void> {
        await super.close();
        // eslint-disable-next-line guard-for-in, no-restricted-syntax
        for (const field in this.defaultProps) {
            this.columns.add(field);
        }

        const asyncParser = new AsyncParser({ fields: Array.from(this.columns) });

        const fd = fs.openSync(this.filePath, "w");
        asyncParser.processor
            .on("data", (chunk) => fs.appendFileSync(fd, chunk.toString()))
            .on("end", () => fs.closeSync(fd))
            .on("error", (err) => console.error(err));

        readline.createInterface({ input: fs.createReadStream(this.tempFile) })
            .on("line", (line) => { asyncParser.input.push(line); })
            .on("close", () => { asyncParser.input.push(null); });

        await asyncParser.promise();
        fs.rmSync(this.tempFile);
    }
}
