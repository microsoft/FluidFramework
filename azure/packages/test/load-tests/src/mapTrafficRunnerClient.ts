/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import commander from "commander";

async function main() {
    const parseIntArg = (value: any): number => {
        if (isNaN(parseInt(value, 10))) {
            throw new commander.InvalidArgumentError("Not a number.");
        }
        return parseInt(value, 10);
    };
    commander
        .version("0.0.1")
        .requiredOption("-d, --docId <docId>", "Document ID to target")
        .requiredOption("-s, --schema <schema>", "Container Schema")
        .requiredOption("-r, --runId <runId>",
            "run a child process with the given id. Requires --url option.", parseIntArg)
        .requiredOption("-wr, --writeRatePerMin <writeRatePerMin>", "Rate of writes", parseIntArg)
        .requiredOption("-wc, --totalWriteCount <totalWriteCount>", "Total write count", parseIntArg)
        .requiredOption("-gc, --totalGroupCount <totalGroupCount>", "Group count", parseIntArg)
        .requiredOption("-k, --sharedMapKey <sharedMapKey>", "Shared map location")
        .option("-l, --log <filter>", "Filter debug logging. If not provided, uses DEBUG env variable.")
        .requiredOption("-v, --verbose", "Enables verbose logging")
        .parse(process.argv);

    const runId: number = commander.runId;
    const docId: string = commander.docId;
    const schema: string = commander.schema;
    const writeRatePerMin: number = commander.writeRatePerMin;
    const totalWriteCount: number = commander.totalWriteCount;
    const totalGroupCount: number = commander.totalGroupCount;
    const sharedMapKey: string = commander.sharedMapKey;
    const log: string = commander.log;
    const verbose: string = commander.verbose;

    console.log("client=======>", runId);
    console.log("   docId", docId);
    console.log("   schema", schema);
    console.log("   writeRatePerMin", writeRatePerMin);
    console.log("   totalWriteCount", totalWriteCount);
    console.log("   totalGroupCount", totalGroupCount);
    console.log("   sharedMapKey", sharedMapKey);
    console.log("   log", log);
    console.log("   verbose", verbose);

    if (log !== undefined) {
        process.env.DEBUG = log;
    }

    if (docId === undefined) {
        console.error("Missing --docId argument needed to run child process");
        process.exit(-1);
    }

    process.exit(0);
}

main()
    .catch(
        (error) => {
            console.error(error);
            process.exit(-1);
        },
    );
