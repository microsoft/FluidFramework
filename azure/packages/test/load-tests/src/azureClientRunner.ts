/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    AzureClient,
    AzureLocalConnectionConfig,
    AzureRemoteConnectionConfig,
} from "@fluidframework/azure-client";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { InsecureTokenProvider } from "@fluidframework/test-client-utils";

import { IRunner, IRunnerEvents, IRunnerStatus } from "./interface";

export interface ICustomUserDetails {
    gender: string;
    email: string;
}

export interface AzureClientFactoryConnectionConfig {
    type: "remote" | "local";
    endpoint: string;
    key?: string;
    tenantId?: string;
    funTokenProvider?: string;
}
export interface AzureClientFactoryConfig {
    connectionConfig: AzureClientFactoryConnectionConfig;
    userId?: string;
    userName?: string;
}

export class AzureClientFactory extends TypedEventEmitter<IRunnerEvents> implements IRunner {
    constructor(private readonly c: AzureClientFactoryConfig) {
        super();
    }

    public async run(): Promise<AzureClient | undefined> {
        const user = {
            id: this.c.userId ?? "testUserId",
            name: this.c.userName ?? "testUserId",
        };
        if (this.c.connectionConfig.type === "remote") {
            if (!this.c.connectionConfig.key) {
                this.emit("status", {
                    status: "error",
                    description: "Invalid connection config. Missing Key.",
                    details: {},
                });
                return;
            }
            if (!this.c.connectionConfig.tenantId) {
                this.emit("status", {
                    status: "error",
                    description: "Invalid connection config. Missing Tenant ID.",
                    details: {},
                });
                return;
            }
        }

        const connectionConfig: AzureRemoteConnectionConfig | AzureLocalConnectionConfig =
            this.c.connectionConfig.type === "remote"
                ? {
                      type: this.c.connectionConfig.type,
                      tenantId: this.c.connectionConfig.tenantId as string,
                      tokenProvider: new InsecureTokenProvider(
                          this.c.connectionConfig.key as string,
                          user,
                      ),
                      endpoint: this.c.connectionConfig.endpoint,
                  }
                : {
                      type: this.c.connectionConfig.type,
                      tokenProvider: new InsecureTokenProvider("", user),
                      endpoint: this.c.connectionConfig.endpoint,
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
        return `Creating ${this.c.connectionConfig.type} Azure Client pointing to: ${this.c.connectionConfig.endpoint}`;
    }
}
