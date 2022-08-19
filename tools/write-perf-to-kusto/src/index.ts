/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import path from "path";
import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";
import { ConsoleLogger } from "./logger";

const _global: any = global;
let logger: ITelemetryBufferedLogger = _global.getTestLogger?.(10000);

if (logger === undefined) {
    logger = new ConsoleLogger();
}

const filesToProcess: string[] = [];

const dirs = process.argv.slice(2);

while (dirs.length > 0) {
    const dir: string = dirs.pop()!;
    const files = fs.readdirSync(dir, { withFileTypes: true });
    files.forEach((dirent) => {
        const direntFullPath = path.join(dir, dirent.name);
        if (dirent.isDirectory()) {
            dirs.push(direntFullPath);
            return;
        }
        if (!dirent.name.endsWith(".json")) {
            return;
        }
        filesToProcess.push(direntFullPath);
    });
}

filesToProcess.forEach((fullPath) => {
    try {
        console.log(`Processing file '${fullPath}'`);
        const data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
        data.benchmarks.forEach((b) => {
            const props = {
                suiteName: data.suiteName,
                benchmarkName: b.benchmarkName,
                arithmeticMean: b.stats.arithmeticMean,
                marginOfError: b.stats.marginOfError,
            };

            logger.send({
                category: "performance",
                eventName: "Benchmark",
                ...props,
            });
        });
    } catch (err) {
        console.error(err);
    }
});

(async () => {
    await logger.flush();
    console.log("Done");
    process.exit(0);
})().catch((e) => {
    console.error(`ERROR: ${e.stack}`);
    process.exit(-1);
});
