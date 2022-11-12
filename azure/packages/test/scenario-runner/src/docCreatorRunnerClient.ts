/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import commander from "commander";

import { ConnectionState } from "fluid-framework";

import { IContainer } from "@fluidframework/container-definitions";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
// import { requestFluidObject } from "@fluidframework/runtime-utils";
import { createFluidTestDriver, generateOdspHostStoragePolicy } from "@fluidframework/test-drivers";
import { timeoutPromise } from "@fluidframework/test-utils";

import { ContainerFactorySchema } from "./interface";
import { getLogger, loggerP } from "./logger";
import {
    attachOdspContainer,
    createOdspContainer,
    createOdspUrl,
    loadInitialObjSchema,
} from "./utils";

export interface DocCreatorRunnerConfig {
    runId: string;
    scenarioName: string;
    stageName: string;
    childId: number;
    connType: string;
    connEndpoint: string;
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
        .requiredOption("-v, --verbose", "Enables verbose logging")
        .parse(process.argv);

    const config = {
        runId: commander.runId,
        scenarioName: commander.scenarioName,
        stageName: commander.stageName,
        childId: commander.childId,
        connType: commander.connType,
        connEndpoint: commander.connEndpoint,
    };

    if (commander.log !== undefined) {
        process.env.DEBUG = commander.log;
    }

    await execRun(config);
    process.exit(0);
}

async function execRun(config: DocCreatorRunnerConfig): Promise<void> {
    let schema;

    const baseLogger = await getLogger(
        {
            runId: config.runId,
            scenarioName: config.scenarioName,
            stageName: config.stageName,
        },
        ["scenario:runner"],
    );

    const scenarioLogger = await getLogger(
        {
            runId: config.runId,
            scenarioName: config.scenarioName,
            stageName: config.stageName,
            namespace: "scenario:runner:DocCreator",
        },
        ["scenario:runner"],
    );

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
            { eventName: "create" },
            async () => {
                return createOdspContainer(schema, testDriver, baseLogger);
            },
            { start: true, end: true, cancel: "generic" },
        );
    } catch {
        throw new Error("Unable to create container.");
    }

    try {
        await PerformanceEvent.timedExecAsync(
            scenarioLogger,
            { eventName: "attach" },
            async () => {
                return attachOdspContainer(container, testDriver);
            },
            { start: true, end: true, cancel: "generic" },
        );
    } catch {
        throw new Error("Unable to attach container.");
    }

    let docUrl: string;
    try {
        docUrl = await PerformanceEvent.timedExecAsync(
            scenarioLogger,
            { eventName: "createUrl" },
            async () => {
                return createOdspUrl(container, testDriver);
            },
            { start: true, end: true, cancel: "generic" },
        );
    } catch {
        throw new Error("Unable to createUrl.");
    }

    if (container.connectionState !== ConnectionState.Connected) {
        await PerformanceEvent.timedExecAsync(
            scenarioLogger,
            { eventName: "connected" },
            async () => {
                container.connect();
                return timeoutPromise((resolve) => container.once("connected", () => resolve()), {
                    durationMs: 10000,
                    errorMsg: "container connect() timeout",
                });
            },
            { start: true, end: true, cancel: "generic" },
        );
    }

    process.send?.(docUrl);
    await (await loggerP).flush();
}

main().catch((error) => {
    console.error(error);
    process.exit(-1);
});
