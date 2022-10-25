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

/**
 * This function will determine if local or remote mode is required (based on FLUID_CLIENT), and return a new
 * {@link AzureClient} instance based on the mode by setting the Connection config accordingly.
 */
export async function createAzureClient(config: AzureClientConfig): Promise<AzureClient> {
    const useAzure = config.connType === "remote";
    const configStr = process.env.fluid__scenario__runner;

    let frsConfig;
    if (useAzure) {
        if (!configStr) {
            throw new Error("Missing FRS env configuration.");
        }

        frsConfig = JSON.parse(configStr);
        if (!frsConfig.tenantId) {
            throw new Error("Missing FRS env configuration: Tenant ID.");
        }
        if (!frsConfig.fnUrl) {
            throw new Error("Missing FRS env configuration: Secret.");
        }
    }

    const tenantId = useAzure ? (frsConfig.tenantId as string) : "frs-client-tenant";
    const fnUrl = useAzure ? (frsConfig.fnUrl as string) : "";
    const connectionProps: AzureRemoteConnectionConfig | AzureLocalConnectionConfig = useAzure
        ? {
              tenantId,
              tokenProvider: createAzureTokenProvider(fnUrl),
              endpoint: config.connEndpoint,
              type: "remote",
          }
        : {
              tokenProvider: new InsecureTokenProvider("fooBar", generateUser()),
              endpoint: config.connEndpoint,
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
