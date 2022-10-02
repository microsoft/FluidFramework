/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import commander from "commander";
import { v4 as uuid } from "uuid";

import { IFluidContainer } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { timeoutPromise } from "@fluidframework/test-utils";

import { ContainerFactorySchema } from "./interface";
import { createAzureClient, delay, loadInitialObjSchema } from "./utils";
import { getLogger } from "./logger";

export interface MapTrafficRunnerConfig {
    runId: number;
    docId: string;
    writeRatePerMin: number;
    totalWriteCount: number;
    sharedMapKey: string;
}

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
        .requiredOption(
            "-r, --runId <runId>",
            "run a child process with the given id. Requires --url option.",
            parseIntArg,
        )
        .requiredOption("-wr, --writeRatePerMin <writeRatePerMin>", "Rate of writes", parseIntArg)
        .requiredOption(
            "-wc, --totalWriteCount <totalWriteCount>",
            "Total write count",
            parseIntArg,
        )
        .requiredOption("-k, --sharedMapKey <sharedMapKey>", "Shared map location")
        .option(
            "-l, --log <filter>",
            "Filter debug logging. If not provided, uses DEBUG env variable.",
        )
        .requiredOption("-v, --verbose", "Enables verbose logging")
        .parse(process.argv);

    const config = {
        runId: commander.runId,
        docId: commander.docId,
        writeRatePerMin: commander.writeRatePerMin,
        totalWriteCount: commander.totalWriteCount,
        sharedMapKey: commander.sharedMapKey,
    };

    if (commander.log !== undefined) {
        process.env.DEBUG = commander.log;
    }

    if (config.docId === undefined) {
        console.error("Missing --docId argument needed to run child process");
        process.exit(-1);
    }

    const logger = await getLogger({
        runId: config.runId,
        scenarioName: "test",
        namespace: "hey:"
    })

    const ac = await createAzureClient({
        userId: "testUserId",
        userName: "testUserName",
        logger
    });
    const s = loadInitialObjSchema(JSON.parse(commander.schema) as ContainerFactorySchema);
    await delay(2000);
    const { container } = await ac.getContainer(config.docId, s);
    await execRun(container, config);
    process.exit(0);
}

async function execRun(container: IFluidContainer, config: MapTrafficRunnerConfig): Promise<void> {
    const msBetweenWrites = 60000 / config.writeRatePerMin;
    const initialObjectsCreate = container.initialObjects;
    const map = initialObjectsCreate[config.sharedMapKey] as SharedMap;

    const logger = await getLogger({
        runId: config.runId,
        scenarioName: "test",
        namespace: "myspace"
    })

    for (let i = 0; i < config.totalWriteCount; i++) {
        await delay(msBetweenWrites);
        // console.log(`Simulating write ${i} for client ${config.runId}`)
        map.set(uuid(), "test-value");
    }

    await PerformanceEvent.timedExecAsync(
        logger,
        { eventName: "SomeRandomEvent" },
        async (_event) => {
            await timeoutPromise((resolve) => container.once("saved", () => resolve()), {
                durationMs: 20000,
                errorMsg: "datastoreSaveAfterAttach timeout",
            });
        },
        { start: true, end: true, cancel: "generic" });

    console.log("flag cleared", container.isDirty);
}

main().catch((error) => {
    console.error(error);
    process.exit(-1);
});
