/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "child_process";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IRunner, IRunnerEvents, IRunnerStatus } from "./interface"

export interface ContainerTrafficSchema {
    initialObjects: {[key: string]: string},
    dynamicObjects?: {[key: string]: string}
}

export interface MapTrafficRunnerConfig {
    docId: string;
    schema: ContainerTrafficSchema;
    numClients: number;
    writeRatePerMin: number;
    sharedMapKey: string;
    totalWriteCount: number;
    totalGroupCount: number;
}

export class MapTrafficRunner extends TypedEventEmitter<IRunnerEvents> implements IRunner {
    private readonly c: MapTrafficRunnerConfig;
    constructor(config: MapTrafficRunnerConfig) {
        super();
        this.c = config;
    }

    public async run(): Promise<void> {
        const runnerArgs: string[][] = [];
        for (let i = 0; i < this.c.numClients; i++) {
            const childArgs: string[] = [
                "./dist/mapTrafficRunnerClient.js",
                "--docId", this.c.docId,
                "--schema", JSON.stringify(this.c.schema),
                "--runId", i.toString(),
                "--writeRatePerMin", this.c.writeRatePerMin.toString(),
                "--totalWriteCount", this.c.totalWriteCount.toString(),
                "--totalGroupCount", this.c.totalGroupCount.toString(),
                "--sharedMapKey", this.c.sharedMapKey,
            ];

            childArgs.push("--verbose");
            runnerArgs.push(childArgs);
        }

        try {
            await Promise.all(runnerArgs.map(async (childArgs, index) => {
                const envVar = { ...process.env };
                const runnerProcess = child_process.spawn(
                    "node",
                    childArgs,
                    {
                        stdio: "inherit",
                        env: envVar,
                    },
                );
                return new Promise((resolve) => runnerProcess.once("close", resolve));
            }));
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
}
