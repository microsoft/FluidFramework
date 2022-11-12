/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import commander from "commander";

import { ConnectionState } from "fluid-framework";

import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import { IRequestHeader } from "@fluidframework/core-interfaces";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { createFluidTestDriver, generateOdspHostStoragePolicy } from "@fluidframework/test-drivers";
import { timeoutPromise } from "@fluidframework/test-utils";

import { ContainerFactorySchema } from "./interface";
import { getLogger, loggerP } from "./logger";
import { loadInitialObjSchema, loadOdspContainer } from "./utils";

export interface DocLoaderRunnerConfig {
    runId: string;
    scenarioName: string;
    stageName: string;
    childId: number;
    docId: string;
    connType: string;
    connEndpoint: string;
    optionBeforeReturn: string;
    deltaConnection: string;
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
        .requiredOption("-s, --schema <schema>", "Container Schema")
        .requiredOption("-d, --docId <docId>", "Document id")
        .requiredOption("-r, --runId <runId>", "orchestrator run id.")
        .requiredOption("-s, --scenarioName <scenarioName>", "scenario name.")
        .requiredOption("-sn, --stageName <stageName>", "stage name.")
        .requiredOption("-c, --childId <childId>", "id of this node client.", parseIntArg)
        .requiredOption("-ct, --connType <connType>", "Connection type")
        .requiredOption("-ce, --connEndpoint <connEndpoint>", "Connection endpoint")
        .option(
            "-l, --log <filter>",
            "Filter debug logging. If not provided, uses DEBUG env variable.",
        )
        .option("-o, --optionBeforeReturn <optionBeforeReturn>", "TODO")
        .option("-dc, --deltaConnection <deltaConnection>", "TODO")
        .requiredOption("-v, --verbose", "Enables verbose logging")
        .parse(process.argv);

    const config = {
        runId: commander.runId,
        scenarioName: commander.scenarioName,
        stageName: commander.stageName,
        childId: commander.childId,
        docId: commander.docId,
        connType: commander.connType,
        connEndpoint: commander.connEndpoint,
        optionBeforeReturn: commander.optionBeforeReturn,
        deltaConnection: commander.deltaConnection,
    };

    if (commander.log !== undefined) {
        process.env.DEBUG = commander.log;
    }

    await execRun(config);
    process.exit(0);
}

async function execRun(config: DocLoaderRunnerConfig): Promise<void> {
    let schema;
    const baseLogger = await getLogger(
        {
            runId: config.runId,
            scenarioName: config.scenarioName,
            stageName: config.stageName,
        },
        ["scenario:runner"],
    );

    const eventMap = new Map([
        [
            "fluid:telemetry:RouterliciousDriver:getWholeFlatSummary",
            "scenario:runner:DocLoader:getSummary",
        ],
    ]);
    const scenarioLogger = await getLogger(
        {
            runId: config.runId,
            scenarioName: config.scenarioName,
            stageName: config.stageName,
            namespace: "scenario:runner:DocLoader",
        },
        ["scenario:runner"],
        eventMap,
    );

    let loadMode: any;
    if (config.optionBeforeReturn) {
        loadMode = { ...loadMode, opsBeforeReturn: config.optionBeforeReturn };
    }
    if (config.deltaConnection) {
        loadMode = { ...loadMode, opsBeforeReturn: config.deltaConnection };
    }

    let headers: IRequestHeader = {};
    if (loadMode) {
        headers = { [LoaderHeader.loadMode]: headers };
    }

    try {
        schema = loadInitialObjSchema(JSON.parse(commander.schema) as ContainerFactorySchema);
    } catch {
        throw new Error("Invalid schema provided.");
    }

    const options = generateOdspHostStoragePolicy(parseInt(config.runId, 10));
    const testDriver = await createFluidTestDriver("odsp", {
        odsp: {
            directory: "scenario",
            options: options[parseInt(config.runId, 10) % options.length],
            supportsBrowserAuth: true,
        },
    });

    let container: IContainer;
    try {
        container = await PerformanceEvent.timedExecAsync(
            scenarioLogger,
            { eventName: "load" },
            async () => {
                return loadOdspContainer(schema, testDriver, baseLogger, config.docId, headers);
            },
            { start: true, end: true, cancel: "generic" },
        );
    } catch {
        throw new Error("Unable to load container.");
    }

    if (container.connectionState !== ConnectionState.Connected) {
        await PerformanceEvent.timedExecAsync(
            scenarioLogger,
            { eventName: "connected" },
            async () => {
                return timeoutPromise((resolve) => container.once("connected", () => resolve()), {
                    durationMs: 30000,
                    errorMsg: "container connect() timeout",
                });
            },
            { start: true, end: true, cancel: "generic" },
        );
    }

    await (await loggerP).flush();
}

main().catch((error) => {
    console.error(error);
    process.exit(-1);
});
