/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import child_process from "child_process";

import { ConnectionState } from "fluid-framework";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { AzureClient } from "@fluidframework/azure-client";
import { IFluidContainer } from "@fluidframework/fluid-static";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { timeoutPromise } from "@fluidframework/test-utils";

import { getLogger } from "./logger";
import { AzureClientConfig, ContainerFactorySchema, IRunConfig, IRunner, IRunnerEvents, IRunnerStatus, RunnnerStatus } from "./interface";
import { delay, loadInitialObjSchema, createAzureClient } from "./utils";

export interface SummarizeRunnerConfig {
    connectionConfig: AzureClientConfig;
    schema: ContainerFactorySchema;
    docIds: string[];
    clientStartDelayMs: number;
    client?: AzureClient;
}

export interface SummarizeRunnerRunConfig extends IRunConfig {
    schema: ContainerFactorySchema;
    childId: number;
    docId: string;
    connType: string;
    connEndpoint: string;
    client?: AzureClient;
}

export class SummarizeRunner extends TypedEventEmitter<IRunnerEvents> implements IRunner {
    private status: RunnnerStatus = "notStarted";

    constructor(public readonly c: SummarizeRunnerConfig) {
        super();
    }

    public async run(config: IRunConfig): Promise<void> {
        this.status = "running";

        await this.spawnChildRunners(config);
        this.status = "success";
    }

    private async spawnChildRunners(config: IRunConfig): Promise<void> {
        this.status = "running";
        const runnerArgs: string[][] = [];
        for (let i = 0; i < this.c.docIds.length; i++) {
            const connection = this.c.connectionConfig;
            const childArgs: string[] = [
                "./dist/summarizeRunnerClient.js",
                "--runId",
                config.runId,
                "--scenarioName",
                config.scenarioName,
                "--childId",
                i.toString(),
                "--schema",
                JSON.stringify(this.c.schema),
                "--connType",
                connection.type,
                "--connEndpoint",
                connection.endpoint,
            ];
            childArgs.push("--verbose");
            runnerArgs.push(childArgs);
        }

        const children: Promise<boolean>[] = [];
        for (const runnerArg of runnerArgs) {
            try {
                children.push(this.createChild(runnerArg));
            } catch {
                throw new Error("Failed to spawn child");
            }
            await delay(this.c.clientStartDelayMs);
        }

        try {
            await Promise.all(children);
        } catch {
            throw new Error("Not all clients closed succesfully.");
        }
    }

    public async runSync(config: IRunConfig): Promise<void> {
        this.status = "running";
        const connType = this.c.connectionConfig.type;
        const connEndpoint = this.c.connectionConfig.endpoint;
        const schema = this.c.schema;
        const client = this.c.client;
        const runs: Promise<void>[] = [];
        for (let i = 0; i < this.c.docIds.length; i++) {
            runs.push(SummarizeRunner.execRun({
                ...config,
                childId: i,
                docId: this.c.docIds[i],
                connType,
                connEndpoint,
                schema,
                client,
            }));
        }
        try {
            await Promise.all(runs);
            this.status = "success";
        } catch {
            this.status = "error";
            throw new Error("Not all clients closed successfully.");
        }
    }

    public static async execRun(runConfig: SummarizeRunnerRunConfig): Promise<void> {
        let schema;
        const logger = await getLogger(
            {
                runId: runConfig.runId,
                scenarioName: runConfig.scenarioName,
                namespace: "scenario:runner:SummaryNack",
            },
            ["scenario:runner"],
        );

        const client = runConfig.client ?? await createAzureClient({
            userId: `testUserId_${runConfig.childId}`,
            userName: `testUserName_${runConfig.childId}`,
            connType: runConfig.connType,
            connEndpoint: runConfig.connEndpoint,
            logger,
        });

        try {
            schema = loadInitialObjSchema(runConfig.schema);
        } catch {
            throw new Error("Invalid schema provided.");
        }

        // Create empty detached container
        let container: IFluidContainer;
        try {
            ({ container } = await PerformanceEvent.timedExecAsync(
                logger,
                { eventName: "create" },
                async () => {
                    return client.createContainer(schema);
                },
                { start: true, end: true, cancel: "generic" },
            ));
        } catch {
            throw new Error("Unable to create container.");
        }

        // Attach container
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

        // Wait for connection to attached container
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
    }

    public stop(): void { }

    public getStatus(): IRunnerStatus {
        return {
            status: this.status,
            description: this.description(),
            details: {},
        };
    }

    private description(): string {
        return `This stage reproduces a known summary nack scenario.`;
    }

    private async createChild(childArgs: string[]): Promise<boolean> {
        const envVar = { ...process.env };
        const runnerProcess = child_process.spawn("node", childArgs, {
            stdio: ["inherit", "inherit", "inherit", "ipc"],
            env: envVar,
        });

        return new Promise((resolve, reject) =>
            runnerProcess.once("close", (status) => {
                if (status === 0) {
                    resolve(true);
                } else {
                    reject(new Error("Client failed to complete the tests succesfully."));
                }
            }),
        );
    }
}
