/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AzureClient } from "@fluidframework/azure-client";
import { TypedEventEmitter } from "@fluidframework/common-utils";

import { IRunConfig, IRunner, IRunnerEvents, IRunnerStatus, RunnnerStatus } from "./interface";
import { createAzureClient } from "./utils";

export interface ICustomUserDetails {
    gender: string;
    email: string;
}

export interface AzureClientRunnerConnectionConfig {
    type: "remote" | "local";
    endpoint: string;
    funTokenProvider?: string;
}
export interface AzureClientRunnerConfig {
    connectionConfig: AzureClientRunnerConnectionConfig;
    userId?: string;
    userName?: string;
}
export interface AzureClientRunnerRunConfig extends IRunConfig {
    connectionConfig: AzureClientRunnerConnectionConfig;
    userId?: string;
    userName?: string;
}

export class AzureClientRunner extends TypedEventEmitter<IRunnerEvents> implements IRunner {
    private status: RunnnerStatus = "notStarted";
    constructor(private readonly c: AzureClientRunnerConfig) {
        super();
    }

    public async run(config: IRunConfig): Promise<AzureClient> {
        this.status = "running";

        try {
            const ac = await AzureClientRunner.execRun({
                ...config,
                ...this.c,
            });

            this.status = "success";
            return ac;
        } catch {
            this.status = "error";
            throw new Error("Failed to create client");
        }
    }

    public async runSync(config: IRunConfig): Promise<AzureClient> {
        return this.run(config);
    }

    public static async execRun(runConfig: AzureClientRunnerRunConfig): Promise<AzureClient> {
        const ac = await createAzureClient({
            connType: runConfig.connectionConfig.type,
            connEndpoint: runConfig.connectionConfig.endpoint,
            userId: runConfig.userId ?? "testUserId",
            userName: runConfig.userName ?? "testUserId",
        });
        return ac;
    }

    public getStatus(): IRunnerStatus {
        return {
            status: this.status,
            description: this.description(),
            details: {},
        };
    }

    public stop(): void { }

    private description(): string {
        return `Creating ${this.c.connectionConfig.type} Azure Client pointing to: ${this.c.connectionConfig.endpoint}`;
    }
}
