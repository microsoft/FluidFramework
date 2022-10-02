/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AzureClient } from "@fluidframework/azure-client";
import { TypedEventEmitter } from "@fluidframework/common-utils";

import { IRunner, IRunnerEvents, IRunnerStatus, RunnnerStatus } from "./interface";
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

export class AzureClientRunner extends TypedEventEmitter<IRunnerEvents> implements IRunner {
    private status: RunnnerStatus = "notstarted";
    constructor(private readonly c: AzureClientRunnerConfig) {
        super();
    }

    public async run(): Promise<AzureClient | undefined> {
        this.status = "running";
        const ac = await createAzureClient({
            connType: this.c.connectionConfig.type,
            connEndpoint: this.c.connectionConfig.endpoint,
            userId: this.c.userId ?? "testUserId",
            userName: this.c.userName ?? "testUserId",
        });
        this.status = "success";
        return ac;
    }

    public getStatus(): IRunnerStatus {
        return {
            status: this.status,
            description: this.description(),
            details: {},
        };
    }

    public stop(): void {}

    private description(): string {
        return `Creating ${this.c.connectionConfig.type} Azure Client pointing to: ${this.c.connectionConfig.endpoint}`;
    }
}
