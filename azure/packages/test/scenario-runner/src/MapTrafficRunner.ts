/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import child_process from "child_process";

import { v4 as uuid } from "uuid";

import { AzureClient } from "@fluidframework/azure-client";
import { SharedMap } from "@fluidframework/map";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { timeoutPromise } from "@fluidframework/test-utils";
import { TypedEventEmitter } from "@fluidframework/common-utils";

import { AzureClientConfig, ContainerFactorySchema, IRunConfig, IRunner, IRunnerEvents, IRunnerStatus, RunnnerStatus } from "./interface";
import { getLogger } from "./logger";
import { delay, createAzureClient, loadInitialObjSchema } from "./utils";

export interface MapTrafficRunnerConfig {
    connectionConfig: AzureClientConfig;
    docId: string;
    schema: ContainerFactorySchema;
    numClients: number;
    clientStartDelayMs: number;
    writeRatePerMin: number;
    sharedMapKey: string;
    totalWriteCount: number;
    client?: AzureClient;
}

export interface MapTrafficRunnerRunConfig extends IRunConfig {
    childId: number;
    docId: string;
    writeRatePerMin: number;
    totalWriteCount: number;
    sharedMapKey: string;
    connType: string;
    connEndpoint: string;
    schema: ContainerFactorySchema;
    client?: AzureClient;
}

export class MapTrafficRunner extends TypedEventEmitter<IRunnerEvents> implements IRunner {
    private status: RunnnerStatus = "notStarted";
    constructor(public readonly c: MapTrafficRunnerConfig) {
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
        for (let i = 0; i < this.c.numClients; i++) {
            const connection = this.c.connectionConfig;
            const childArgs: string[] = [
                "./dist/mapTrafficRunnerClient.js",
                "--runId",
                config.runId,
                "--scenarioName",
                config.scenarioName,
                "--childId",
                i.toString(),
                "--docId",
                this.c.docId,
                "--schema",
                JSON.stringify(this.c.schema),
                "--writeRatePerMin",
                this.c.writeRatePerMin.toString(),
                "--totalWriteCount",
                this.c.totalWriteCount.toString(),
                "--sharedMapKey",
                this.c.sharedMapKey,
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
        const docId = this.c.docId;
        const connType = this.c.connectionConfig.type;
        const connEndpoint = this.c.connectionConfig.endpoint;
        const schema = this.c.schema;
        const totalWriteCount = this.c.totalWriteCount;
        const writeRatePerMin = this.c.writeRatePerMin;
        const sharedMapKey = this.c.sharedMapKey;
        const client = this.c.client;
        const runs: Promise<void>[] = [];
        for (let i = 0; i < this.c.numClients; i++) {
            runs.push(MapTrafficRunner.execRun({
                ...config,
                schema,
                childId: i,
                docId,
                connType,
                connEndpoint,
                totalWriteCount,
                writeRatePerMin,
                sharedMapKey,
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

    public static async execRun(runConfig: MapTrafficRunnerRunConfig): Promise<void> {
        const msBetweenWrites = 60000 / runConfig.writeRatePerMin;
        const logger = await getLogger({
            runId: runConfig.runId,
            scenarioName: runConfig.scenarioName,
            namespace: "scenario:runner:MapTraffic",
        });

        const ac = runConfig.client ?? await createAzureClient({
            userId: "testUserId",
            userName: "testUserName",
            connType: runConfig.connType,
            connEndpoint: runConfig.connEndpoint,
            logger,
        });

        const s = loadInitialObjSchema(runConfig.schema);
        const { container } = await PerformanceEvent.timedExecAsync(
            logger,
            { eventName: "ContainerLoad", clientId: runConfig.childId },
            async (_event) => {
                return ac.getContainer(runConfig.docId, s);
            },
            { start: true, end: true, cancel: "generic" },
        );

        const initialObjectsCreate = container.initialObjects;
        const map = initialObjectsCreate[runConfig.sharedMapKey] as SharedMap;

        for (let i = 0; i < runConfig.totalWriteCount; i++) {
            await delay(msBetweenWrites);
            // console.log(`Simulating write ${i} for client ${runConfig.runId}`)
            map.set(uuid(), "test-value");
        }

        await PerformanceEvent.timedExecAsync(
            logger,
            { eventName: "Catchup", clientId: runConfig.childId },
            async (_event) => {
                await timeoutPromise((resolve) => container.once("saved", () => resolve()), {
                    durationMs: 20000,
                    errorMsg: "datastoreSaveAfterAttach timeout",
                });
            },
            { start: true, end: true, cancel: "generic" },
        );
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
        return `This stage runs SharedMap traffic on multiple clients.`;
    }

    private async createChild(childArgs: string[]): Promise<boolean> {
        const envVar = { ...process.env };
        const runnerProcess = child_process.spawn("node", childArgs, {
            stdio: "inherit",
            env: envVar,
        });

        return new Promise((resolve, reject) =>
            runnerProcess.once("close", (status) => {
                if (status === 0) {
                    resolve(true);
                } else {
                    reject(new Error("Client failed to complet the tests succesfully."));
                }
            }),
        );
    }
}
