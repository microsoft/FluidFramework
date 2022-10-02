/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    AzureClient,
    AzureLocalConnectionConfig,
    AzureRemoteConnectionConfig,
} from "@fluidframework/azure-client";
import { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { generateUser } from "@fluidframework/server-services-client";
import { TelemetryLogger } from "@fluidframework/telemetry-utils";
import { InsecureTokenProvider } from "@fluidframework/test-client-utils";

import { createAzureTokenProvider } from "./AzureTokenFactory";
import { ContainerFactorySchema } from "./interface";

export interface AzureClientConfig {
    connType: string;
    connEndpoint: string;
    userId?: string;
    userName?: string;
    logger?: TelemetryLogger;
}

export const delay = async (timeMs: number): Promise<void> =>
    new Promise((resolve) => setTimeout(() => resolve(), timeMs));

export function loadInitialObjSchema(source: ContainerFactorySchema): ContainerSchema {
    const schema: ContainerSchema = {
        initialObjects: {},
    };

    for (const k of Object.keys(source.initialObjects)) {
        if (source.initialObjects[k] === "SharedMap") {
            schema.initialObjects[k] = SharedMap;
        }
    }
    return schema;
}

/**
 * This function will determine if local or remote mode is required (based on FLUID_CLIENT), and return a new
 * {@link AzureClient} instance based on the mode by setting the Connection config accordingly.
 */
export async function createAzureClient(config: AzureClientConfig): Promise<AzureClient> {
    const useAzure = config.connType === "remote";
    const tenantId = useAzure
        ? (process.env.azure__fluid__relay__service__tenantId as string)
        : "frs-client-tenant";


    console.log("n-------", useAzure)
    // use AzureClient remote mode will run against live Azure Fluid Relay.
    // Default to running Tinylicious for PR validation
    // and local testing so it's not hindered by service availability
    const connectionProps: AzureRemoteConnectionConfig | AzureLocalConnectionConfig = useAzure
        ? {
              tenantId,
              tokenProvider: createAzureTokenProvider(config.userId, config.userName),
              endpoint: config.connEndpoint, // "https://alfred.westus2.fluidrelay.azure.com",
              type: "remote",
          }
        : {
              tokenProvider: new InsecureTokenProvider("fooBar", generateUser()),
              endpoint: config.connEndpoint, // "http://localhost:7070",
              type: "local",
          };

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
