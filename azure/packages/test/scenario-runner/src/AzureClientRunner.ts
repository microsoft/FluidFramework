/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AzureClient } from "@fluidframework/azure-client";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";

import { IRunConfig, IRunner, IRunnerEvents, IRunnerStatus, RunnnerStatus } from "./interface";
import { getLogger } from "./logger";
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
    private status: RunnnerStatus = "notStarted";
    constructor(private readonly c: AzureClientRunnerConfig) {
        super();
    }

    public async run(config: IRunConfig): Promise<AzureClient | undefined> {
        const logger = await getLogger({
            runId: config.runId,
            scenarioName: config.scenarioName,
            namespace: "scenario:runner:acrunner",
        });
        this.status = "running";

        const ac = await PerformanceEvent.timedExecAsync(
            logger,
            { eventName: "RunStage" },
            async () => {
                return createAzureClient({
                    connType: this.c.connectionConfig.type,
                    connEndpoint: this.c.connectionConfig.endpoint,
                    userId: this.c.userId ?? "testUserId",
                    userName: this.c.userName ?? "testUserId",
                });
            },
            { start: true, end: true, cancel: "generic" },
        );
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
