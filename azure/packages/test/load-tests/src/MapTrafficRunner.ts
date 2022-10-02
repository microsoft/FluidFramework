/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "child_process";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IRunner, IRunnerEvents, IRunnerStatus } from "./interface"
import { delay } from "./utils"

export interface AzureClientConfig {
    type: "remote" | "local";
    endpoint: string;
    key?: string;
    tenantId?: string;
}

export interface ContainerTrafficSchema {
    initialObjects: {[key: string]: string},
    dynamicObjects?: {[key: string]: string}
}

export interface MapTrafficRunnerConfig {
    connectionConfig: AzureClientConfig;
    docId: string;
    schema: ContainerTrafficSchema;
    numClients: number;
    clientStartDelayMs: number;
    writeRatePerMin: number;
    sharedMapKey: string;
    totalWriteCount: number;
}

export class MapTrafficRunner extends TypedEventEmitter<IRunnerEvents> implements IRunner {
    constructor(public readonly c: MapTrafficRunnerConfig) {
        super();
    }

    public async run(): Promise<void> {
        const runnerArgs: string[][] = [];
        for (let i = 0; i < this.c.numClients; i++) {
            const connection = this.c.connectionConfig;
            const childArgs: string[] = [
                "./dist/mapTrafficRunnerClient.js",
                "--docId", this.c.docId,
                "--schema", JSON.stringify(this.c.schema),
                "--runId", i.toString(),
                "--writeRatePerMin", this.c.writeRatePerMin.toString(),
                "--totalWriteCount", this.c.totalWriteCount.toString(),
                "--sharedMapKey", this.c.sharedMapKey,
                "--connType", connection.type,
                "--connEndpoint", connection.endpoint,
            ];
            childArgs.push("--verbose");
            runnerArgs.push(childArgs);
        }

        const children: Promise<boolean>[] = []
        for(const runnerArg of runnerArgs) {
            try {
                children.push(this.createChild(runnerArg))
            } catch {
                this.emit("error", {
                    status: "Failed to spawn child",
                    description: this.description(),
                    details: {},
                });
            }
            await delay(this.c.clientStartDelayMs)
        }

        try {
            await Promise.all(children);
        } finally {
            this.emit("status", {
                status: "success",
                description: this.description(),
                details: {},
            });
        }
    }

    public stop(): void {
        console.log("stop");
    }

    public getStatus(): IRunnerStatus {
        return {
            status: "notstarted",
            description: this.description(),
            details: {},
        };
    }

    private description(): string {
        return `This stage runs SharedMap traffic on multiple clients.`
    }

    private async createChild(childArgs: string[]): Promise<boolean> {
        const envVar = { ...process.env };
        const runnerProcess = child_process.spawn(
            "node",
            childArgs,
            {
                stdio: "inherit",
                env: envVar,
            },
        );
        return new Promise((resolve) => runnerProcess.once("close", () => resolve(true)));
    }
}
