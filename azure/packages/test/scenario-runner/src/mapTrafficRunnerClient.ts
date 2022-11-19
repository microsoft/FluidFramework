/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import commander from "commander";
import { v4 as uuid } from "uuid";

import { ConnectionState } from "fluid-framework";

import { AzureClient } from "@fluidframework/azure-client";
import { SharedMap } from "@fluidframework/map";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { timeoutPromise } from "@fluidframework/test-utils";

import { ContainerFactorySchema } from "./interface";
import { getLogger } from "./logger";
import { createAzureClient, delay, loadInitialObjSchema } from "./utils";

export interface MapTrafficRunnerConfig {
    runId: string;
    scenarioName: string;
    childId: number;
    docId: string;
    writeRatePerMin: number;
    totalWriteCount: number;
    sharedMapKey: string;
    connType: string;
    connEndpoint: string;
}

const eventMap = new Map([
    ["fluid:telemetry:OpPerf", "scenario:runner:MapTraffic:OpPerf"],
    ["fluid:telemetry:OrderedClientElection", "scenario:runner:MapTraffic:OrderedClientElection"],
    ["fluid:telemetry:Container:ContainerClose", "scenario:runner:MapTraffic:ContainerClose"],
    ["fluid:telemetry:DeltaManager:GetDeltas_Exception", "scenario:runner:MapTraffic:GetDeltas_Exception"],
    ["fluid:telemetry:DeltaManager:NoJoinOp", "scenario:runner:MapTraffic:NoJoinOp"]
]);

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
        .requiredOption("-r, --runId <runId>", "orchestrator run id.")
        .requiredOption("-s, --scenarioName <scenarioName>", "scenario name.")
        .requiredOption("-c, --childId <childId>", "id of this node client.", parseIntArg)
        .requiredOption("-wr, --writeRatePerMin <writeRatePerMin>", "Rate of writes", parseIntArg)
        .requiredOption(
            "-wc, --totalWriteCount <totalWriteCount>",
            "Total write count",
            parseIntArg,
        )
        .requiredOption("-k, --sharedMapKey <sharedMapKey>", "Shared map location")
        .requiredOption("-ct, --connType <connType>", "Connection type")
        .requiredOption("-ce, --connEndpoint <connEndpoint>", "Connection endpoint")
        .option(
            "-l, --log <filter>",
            "Filter debug logging. If not provided, uses DEBUG env variable.",
        )
        .requiredOption("-v, --verbose", "Enables verbose logging")
        .parse(process.argv);

    const config = {
        runId: commander.runId,
        scenarioName: commander.scenarioName,
        childId: commander.childId,
        docId: commander.docId,
        writeRatePerMin: commander.writeRatePerMin,
        totalWriteCount: commander.totalWriteCount,
        sharedMapKey: commander.sharedMapKey,
        connType: commander.connType,
        connEndpoint: commander.connEndpoint,
    };

    if (commander.log !== undefined) {
        process.env.DEBUG = commander.log;
    }

    if (config.docId === undefined) {
        console.error("Missing --docId argument needed to run child process");
        process.exit(-1);
    }

    const logger = await getLogger(
        {
            runId: config.runId,
            scenarioName: config.scenarioName,
        },
        ["scenario:runner"],
        eventMap,
    );

    const ac = await createAzureClient({
        userId: "testUserId",
        userName: "testUserName",
        connType: config.connType,
        connEndpoint: config.connEndpoint,
        logger,
    });

    await execRun(ac, config);
    process.exit(0);
}

async function execRun(ac: AzureClient, config: MapTrafficRunnerConfig): Promise<void> {
    const msBetweenWrites = 60000 / config.writeRatePerMin;
    const logger = await getLogger(
        {
            runId: config.runId,
            scenarioName: config.scenarioName,
            namespace: "scenario:runner:MapTraffic",
        },
        ["scenario:runner"],
        eventMap,
    );

    const s = loadInitialObjSchema(JSON.parse(commander.schema) as ContainerFactorySchema);
    const { container } = await PerformanceEvent.timedExecAsync(
        logger,
        { eventName: "load", clientId: config.childId },
        async (_event) => {
            return ac.getContainer(config.docId, s);
        },
        { start: true, end: true, cancel: "generic" },
    );

    await PerformanceEvent.timedExecAsync(
        logger,
        { eventName: "connected" },
        async () => {
            if (container.connectionState !== ConnectionState.Connected) {
                return timeoutPromise((resolve) => container.once("connected", () => resolve()), {
                    durationMs: 60000,
                    errorMsg: "container connect() timeout",
                });
            }
        },
        { start: true, end: true, cancel: "generic" },
    );

    const initialObjectsCreate = container.initialObjects;
    const map = initialObjectsCreate[config.sharedMapKey] as SharedMap;

    try {
        for (let i = 0; i < config.totalWriteCount; i++) {
            await delay(msBetweenWrites);
            // console.log(`Simulating write ${i} for client ${config.runId}`)
            map.set(uuid(), "test-value");
        }
    } catch(e) {
        console.log("error or write", e)
    }

    // await PerformanceEvent.timedExecAsync(
    //     logger,
    //     { eventName: "Catchup", clientId: config.childId },
    //     async (_event) => {
    //         await timeoutPromise((resolve) => container.once("saved", () => resolve()), {
    //             durationMs: 20000,
    //             errorMsg: "datastoreSaveAfterAttach timeout",
    //         });
    //     },
    //     { start: true, end: true, cancel: "generic" },
    // );
}

main().catch((error) => {
    console.error(error);
    process.exit(-1);
});
