/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */


// import { v4 as uuid } from "uuid";
import { AriaLogger } from "@ff-internal/aria-logger";
//import "@ff-internal/aria-logger";

// const logger = new AriaLogger("mySessionId20220816_2");
const logger2 = new AriaLogger("mySessionId");
// const ariaLogger_uuid = new AriaLogger(uuid());
const logger = getTestLogger?.();

const event = {
    category: "generic",
    eventName: "testevents",
    suiteName: "IdCompressor Perf",
    benchmarkName:"deserialize an IdCompressor (with overrides)",
    arithmeticMean: 0.0006604403100499611,
    marginOfError:0.0000037975991628058,
};
logger.send({ ...event, loggerName: "logger-getTestLogger" });
// ariaLogger.send({ ...event, loggerName: "ariaLogger" });
// ariaLogger_uuid.send({ ...event, loggerName: "ariaLogger_uuid" });

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
    await logger.flush();
    await logger2.flush();
    // await ariaLogger.flush();
    // await ariaLogger_uuid.flush();
    await delay(1000);
    console.log("Done");
    process.exit(0);
})().catch(e => {
    console.error(`ERROR: ${e.stack}`);
    process.exit(-1);
});
