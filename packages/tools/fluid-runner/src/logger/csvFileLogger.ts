/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import path from "path";
import readline from "readline";
import { AsyncParser } from "json2csv";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { BaseFileLogger } from "./FileLogger";

/**
 * Logger that writes events into a defined CSV file
 */
export class CSVFileLogger extends BaseFileLogger {
    // eslint-disable-next-line max-len
    // private readonly csvFileName = "C:\\Users\\kianthompson\\Documents\\RandomData\\fluid-runner\\src\\logger\\sample.csv";
    private readonly columns = new Set();
    private readonly tempFile = path.join(__dirname, "tempOutputFile.txt");

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
        // eslint-disable-next-line guard-for-in, no-restricted-syntax
        for (const field in this.defaultFields) {
            this.columns.add(field);
        }

        const asyncParser = new AsyncParser({ fields: Array.from(this.columns) });

        const fd = fs.openSync(this.tempFile, "w");
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
