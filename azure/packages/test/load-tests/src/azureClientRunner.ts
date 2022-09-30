/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    AzureClient,
    AzureRemoteConnectionConfig,
    AzureLocalConnectionConfig,
} from "@fluidframework/azure-client";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { generateTestUser, InsecureTokenProvider } from "@fluidframework/test-client-utils";
import { IRunner, IRunnerEvents, IRunnerStatus } from "./interface";

export interface ICustomUserDetails {
    gender: string;
    email: string;
}

export interface AzureClientFactoryConfig {
    type: "remote" | "local";
    tenantId: string;
    endpoint: string;
    key: string;
    funTokenProvider?: string;
    userId?: string;
    userName?: string;
}

export class AzureClientFactory extends TypedEventEmitter<IRunnerEvents> implements IRunner {
    private readonly c: AzureClientFactoryConfig;
    constructor(config: AzureClientFactoryConfig) {
        super();
        this.c = config;
    }

    public async run(): Promise<AzureClient> {
        const user = generateTestUser();
        const connectionConfig: AzureRemoteConnectionConfig | AzureLocalConnectionConfig = this.c.type === "remote"
        ? {
            type: this.c.type,
            tenantId: this.c.tenantId,
            tokenProvider: new InsecureTokenProvider(this.c.key, user),
            endpoint: this.c.endpoint,
        }
        : {
            type: this.c.type,
            tokenProvider: new InsecureTokenProvider("", user),
            endpoint: this.c.endpoint,
        };

        const clientProps = {
            connection: connectionConfig,
        };

        const ac = new AzureClient(clientProps);
        this.emit("status", {
            status: "success",
            description: this.description(),
            details: {},
        });
        return ac;
    }

    public getStatus(): IRunnerStatus {
        return {
            status: "notstarted",
            description: this.description(),
            details: {},
        };
    }

    public stop(): void {
        console.log("stop");
    }

    private description(): string {
        return `Creating ${this.c.type} Azure Client pointing to: ${this.c.endpoint}`
    }
}
