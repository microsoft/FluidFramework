/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    AzureClient,
    AzureFunctionTokenProvider,
    AzureLocalConnectionConfig,
    AzureRemoteConnectionConfig,
} from "@fluidframework/azure-client";
import { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { generateUser } from "@fluidframework/server-services-client";
import { TelemetryLogger } from "@fluidframework/telemetry-utils";
import { InsecureTokenProvider } from "@fluidframework/test-client-utils";

import { ContainerFactorySchema } from "./interface";

export interface AzureClientConfig {
    connType: string;
    connEndpoint?: string;
    userId?: string;
    userName?: string;
    logger?: TelemetryLogger;
    tenantId?: string;
    tenantKey?: string;
    functionUrl?: string;
    secureTokenProvider?: boolean; // defaults to Insecure
}

export const delay = async (timeMs: number): Promise<void> =>
    new Promise((resolve) => setTimeout(() => resolve(), timeMs));

export function loadInitialObjSchema(source: ContainerFactorySchema): ContainerSchema {
    const schema: ContainerSchema = {
        initialObjects: {},
    };

    for (const k of Object.keys(source.initialObjects)) {
        // Todo: more DDS types to add.
        if (source.initialObjects[k] === "SharedMap") {
            schema.initialObjects[k] = SharedMap;
        }
    }
    return schema;
}

export function createAzureTokenProvider(
    fnUrl: string,
    userID?: string,
    userName?: string,
): AzureFunctionTokenProvider {
    return new AzureFunctionTokenProvider(`${fnUrl}/api/GetFrsToken`, {
        userId: userID ?? "foo",
        userName: userName ?? "bar",
    });
}

export function createInsecureTokenProvider(
    tenantKey: string,
    userID?: string,
    userName?: string,
): InsecureTokenProvider {
    return new InsecureTokenProvider(tenantKey, {
        id: userID ?? "foo",
    });
}

/**
 * This function will determine if local or remote mode is required (based on FLUID_CLIENT), and return a new
 * {@link AzureClient} instance based on the mode by setting the Connection config accordingly.
 */
export async function createAzureClient(config: AzureClientConfig): Promise<AzureClient> {
    const useAzure = config.connType === "remote";

    if (!config.connEndpoint) {
        throw new Error("Missing FRS configuration: Relay Service Endpoint URL.");
    }

    let connectionProps: AzureRemoteConnectionConfig | AzureLocalConnectionConfig;

    if (useAzure) {
        if (!config.tenantId) {
            throw new Error("Missing FRS configuration: Tenant ID.");
        }
        if (!config.functionUrl) {
            throw new Error("Missing FRS configuration: Function URL.");
        }
        if (config.secureTokenProvider) {
            if (!process.env.azure__fluid__relay__service__function__url) {
                throw new Error("Missing FRS env configuration: Function URL.");
            }
        } else {
            if (!process.env.azure__fluid__relay__service__tenantKey) {
                throw new Error("Missing FRS env configuration: Tenant Primary Key.");
            }
        }
    }

    const tenantId = useAzure
        ? (process.env.azure__fluid__relay__service__tenantId as string)
        : "frs-client-tenant";

    let connectionProps: AzureRemoteConnectionConfig | AzureLocalConnectionConfig;

    if (useAzure) {
        if (useInsecureTokenProvider) {
            const tenantKey = process.env.azure__fluid__relay__service__tenantKey as string;
            connectionProps = {
                tenantId,
                tokenProvider: createInsecureTokenProvider(
                    tenantKey,
                    config.userId,
                    config.userName,
                ),
                endpoint: config.connEndpoint,
                type: "remote",
            };
        } else {
            const fnUrl = process.env.azure__fluid__relay__service__function__url as string;
            connectionProps = {
                tenantId,
                tokenProvider: createAzureTokenProvider(fnUrl, config.userId, config.userName),
                endpoint: config.connEndpoint,
                type: "remote",
            };
        }
    } else {
        connectionProps = {
            tokenProvider: new InsecureTokenProvider("fooBar", generateUser()),
            endpoint: config.connEndpoint,
            type: "local",
        };
    }

        if (!config.functionUrl) {
            throw new Error("Missing FRS configuration: Function URL.");
        }
        connectionProps = {
            tenantId: config.tenantId,
            tokenProvider: createAzureTokenProvider(
                config.functionUrl,
                config.userId,
                config.userName,
            ),
            endpoint: config.connEndpoint,
            type: "remote",
        };
    } else {
        connectionProps = {
            tokenProvider: new InsecureTokenProvider("fooBar", generateUser()),
            endpoint: config.connEndpoint,
            type: "local",
        };
    }

    return new AzureClient({ connection: connectionProps, logger: config.logger });
}

export async function createContainer(
    ac: AzureClient,
    s: ContainerFactorySchema,
): Promise<IFluidContainer> {
    const schema = loadInitialObjSchema(s);
    const r = await ac.createContainer(schema);
    return r.container;
}
