/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This file represents the public API. Consumers of this package will not see exported modules unless
 * they are enumerated here.  Removing / editing existing exports here will often indicate a breaking
 * change, so please be cognizant of changes made here.
 */

//import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";
import "@ff-internal/aria-logger";
// import { AriaLogger } from "@ff-internal/aria-logger";

// const logger = new AriaLogger("mySessionId20220816_2");
const logger = getTestLogger?.();

const filesToProcess: string[] = [];

const dirs = process.argv.slice(2);

while (dirs.length > 0) {
    const dir = dirs.pop()!;
    const files = fs.readdirSync(dir, { withFileTypes: true });
    files.forEach((dirent) => {
        const direntFullPath = path.join(dir!, dirent.name);
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
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        //console.log(data);
        data.benchmarks.forEach(b => {
            const props = {
                suiteName: data.suiteName,
                benchmarkName: b.benchmarkName,
                arithmeticMean: b.stats.arithmeticMean,
                marginOfError: b.stats.marginOfError,
            };

            console.log(JSON.stringify(props));
            logger.send({
                category: "generic",
                eventName: "testevents",
                ...props
            });
        });
    } catch (err) {
        console.error(err);
    }
});

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
    await logger.flush();
    await delay(1000);
    console.log("Done");
    process.exit(0);
})().catch(e => {
    console.error(`ERROR: ${e.stack}`);
    process.exit(-1);
});
