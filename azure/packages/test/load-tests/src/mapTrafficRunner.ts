/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "child_process";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IRunner, IRunnerEvents, IRunnerStatus } from "./interface"
import { delay } from "./utils"

export interface ContainerTrafficSchema {
    initialObjects: {[key: string]: string},
    dynamicObjects?: {[key: string]: string}
}

export interface MapTrafficRunnerConfig {
    docId: string;
    schema: ContainerTrafficSchema;
    numClients: number;
    clientStartDelayMs: number;
    writeRatePerMin: number;
    sharedMapKey: string;
    totalWriteCount: number;
}

export class MapTrafficRunner extends TypedEventEmitter<IRunnerEvents> implements IRunner {
    constructor(public readonly config: MapTrafficRunnerConfig) {
        super();
    }

    public async run(): Promise<void> {
        const runnerArgs: string[][] = [];
        for (let i = 0; i < this.config.numClients; i++) {
            const childArgs: string[] = [
                "./dist/mapTrafficRunnerClient.js",
                "--docId", this.config.docId,
                "--schema", JSON.stringify(this.config.schema),
                "--runId", i.toString(),
                "--writeRatePerMin", this.config.writeRatePerMin.toString(),
                "--totalWriteCount", this.config.totalWriteCount.toString(),
                "--sharedMapKey", this.config.sharedMapKey,
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
            await delay(this.config.clientStartDelayMs)
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
