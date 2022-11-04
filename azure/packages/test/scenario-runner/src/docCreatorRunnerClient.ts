/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import commander from "commander";

import { ConnectionState } from "fluid-framework";

import { AzureClient } from "@fluidframework/azure-client";
import { IFluidContainer } from "@fluidframework/fluid-static";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { timeoutPromise } from "@fluidframework/test-utils";

import { ContainerFactorySchema } from "./interface";
import { getLogger } from "./logger";
import { createAzureClient, loadInitialObjSchema } from "./utils";

export interface DocCreatorRunnerConfig {
    runId: string;
    scenarioName: string;
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
        childId: commander.childId,
        connType: commander.connType,
        connEndpoint: commander.connEndpoint,
    };

    if (commander.log !== undefined) {
        process.env.DEBUG = commander.log;
    }

    const logger = await getLogger(
        {
            runId: config.runId,
            scenarioName: config.scenarioName,
        },
        ["scenario:runner"],
    );

    const ac = await createAzureClient({
        userId: `testUserId_${config.childId}`,
        userName: `testUserName_${config.childId}`,
        connType: config.connType,
        connEndpoint: config.connEndpoint,
        logger,
    });

    await execRun(ac, config);
    process.exit(0);
}

async function execRun(ac: AzureClient, config: DocCreatorRunnerConfig): Promise<void> {
    let schema;
    const logger = await getLogger(
        {
            runId: config.runId,
            scenarioName: config.scenarioName,
            namespace: "scenario:runner:DocCreator",
        },
        ["scenario:runner"],
    );

    try {
        schema = loadInitialObjSchema(JSON.parse(commander.schema) as ContainerFactorySchema);
    } catch {
        throw new Error("Invalid schema provided.");
    }

    let container: IFluidContainer;
    try {
        ({ container } = await PerformanceEvent.timedExecAsync(
            logger,
            { eventName: "create" },
            async () => {
                return ac.createContainer(schema);
            },
            { start: true, end: true, cancel: "generic" },
        ));
    } catch {
        throw new Error("Unable to create container.");
    }

    let id: string;
    try {
        id = await PerformanceEvent.timedExecAsync(
            logger,
            { eventName: "attach" },
            async () => {
                return container.attach();
            },
            { start: true, end: true, cancel: "generic" },
        );
    } catch {
        throw new Error("Unable to attach container.");
    }

    if (container.connectionState !== ConnectionState.Connected) {
        await PerformanceEvent.timedExecAsync(
            logger,
            { eventName: "connected" },
            async () => {
                return timeoutPromise((resolve) => container.once("connected", () => resolve()), {
                    durationMs: 10000,
                    errorMsg: "container connect() timeout",
                });
            },
            { start: true, end: true, cancel: "generic" },
        );
    }

    process.send?.(id);
}

main().catch((error) => {
    console.error(error);
    process.exit(-1);
});
