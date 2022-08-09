/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This file represents the public API. Consumers of this package will not see exported modules unless
 * they are enumerated here.  Removing / editing existing exports here will often indicate a breaking
 * change, so please be cognizant of changes made here.
 */

import fs from "fs";
import "@ff-internal/aria-logger";

const logger = getTestLogger?.();

(async () => {
    try {
        const data = JSON.parse(fs.readFileSync('../../packages/dds/tree/benchOutput/ITreeCursor_perfresult.json', 'utf8'));
        console.log(data);
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
                eventName: "alejandrovi-test-for-benchmark-telemetry",
                ...props
            });
        });
    } catch (err) {
        console.error(err);
    }

    await logger.flush();
    console.log("Done");
    process.exit(0);
})().catch(e => {
    console.error(`ERROR: ${e.stack}`);
    process.exit(-1);
});
