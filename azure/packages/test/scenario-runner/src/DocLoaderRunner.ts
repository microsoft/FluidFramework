/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import child_process from "child_process";

import { ConnectionState } from "fluid-framework";
import { AzureClient } from "@fluidframework/azure-client";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IFluidContainer } from "@fluidframework/fluid-static";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { timeoutPromise } from "@fluidframework/test-utils";

import { AzureClientConfig, ContainerFactorySchema, IRunConfig, IRunner, IRunnerEvents, IRunnerStatus, RunnnerStatus } from "./interface";
import { delay, createAzureClient, loadInitialObjSchema } from "./utils";
import { getLogger } from "./logger";

export interface DocLoaderRunnerConfig {
    connectionConfig: AzureClientConfig;
    schema: ContainerFactorySchema;
    docIds: string[];
    clientStartDelayMs: number;
    client?: AzureClient;
}

export interface DocLoaderRunnerRunConfig extends IRunConfig {
    childId: number;
    schema: ContainerFactorySchema;
    docId: string;
    connType: string;
    connEndpoint: string;
    client?: AzureClient;
}

export class DocLoaderRunner extends TypedEventEmitter<IRunnerEvents> implements IRunner {
    private status: RunnnerStatus = "notStarted";
    constructor(public readonly c: DocLoaderRunnerConfig) {
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
        let i = 0;
        for (const docId of this.c.docIds) {
            const connection = this.c.connectionConfig;
            const childArgs: string[] = [
                "./dist/docLoaderRunnerClient.js",
                "--runId",
                config.runId,
                "--scenarioName",
                config.scenarioName,
                "--childId",
                (i++).toString(),
                "--docId",
                docId,
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
        let i = 0;
        const runs: Promise<void>[] = [];
        for (const docId of this.c.docIds) {
            runs.push(DocLoaderRunner.execRun({
                ...config,
                childId: i++,
                docId,
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
            throw new Error("Not all clients closed succesfully.");
        }
    }

    public static async execRun(runConfig: DocLoaderRunnerRunConfig): Promise<void> {
        let schema;
        const eventMap = new Map([
            [
                "fluid:telemetry:RouterliciousDriver:getWholeFlatSummary",
                "scenario:runner:DocLoader:getSummary",
            ],
        ]);
        const logger = await getLogger(
            {
                runId: runConfig.runId,
                scenarioName: runConfig.scenarioName,
                namespace: "scenario:runner:DocLoader",
            },
            ["scenario:runner"],
            eventMap,
        );

        const ac = runConfig.client ?? await createAzureClient({
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

        let container: IFluidContainer;
        try {
            ({ container } = await PerformanceEvent.timedExecAsync(
                logger,
                { eventName: "load" },
                async () => {
                    return ac.getContainer(runConfig.docId, schema);
                },
                { start: true, end: true, cancel: "generic" },
            ));
        } catch {
            throw new Error("Unable to load container.");
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
        return `This stage loads a list of documents, given their IDs`;
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
