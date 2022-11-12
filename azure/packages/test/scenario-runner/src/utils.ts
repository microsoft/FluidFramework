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
import { IContainer, IFluidModuleWithDetails } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { IRequestHeader } from "@fluidframework/core-interfaces";
import {
    ContainerSchema,
    DOProviderContainerRuntimeFactory,
    IFluidContainer,
} from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { generateUser } from "@fluidframework/server-services-client";
import { TelemetryLogger } from "@fluidframework/telemetry-utils";
import { InsecureTokenProvider } from "@fluidframework/test-client-utils";
import {
    LocalServerTestDriver,
    OdspTestDriver,
    RouterliciousTestDriver,
    TinyliciousTestDriver,
} from "@fluidframework/test-drivers";

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
    if (useAzure) {
        if (!process.env.azure__fluid__relay__service__tenantId) {
            throw new Error("Missing FRS env configuration: Tenant ID.");
        }
        if (!process.env.azure__fluid__relay__service__function__url) {
            throw new Error("Missing FRS env configuration: Secret.");
        }
    }

    const tenantId = useAzure
        ? (process.env.azure__fluid__relay__service__tenantId as string)
        : "frs-client-tenant";
    const fnUrl = useAzure
        ? (process.env.azure__fluid__relay__service__function__url as string)
        : "";
    const connectionProps: AzureRemoteConnectionConfig | AzureLocalConnectionConfig = useAzure
        ? {
              tenantId,
              tokenProvider: createAzureTokenProvider(fnUrl, config.userId, config.userName),
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

export async function attachOdspContainer(
    container: IContainer,
    testDriver:
        | LocalServerTestDriver
        | TinyliciousTestDriver
        | RouterliciousTestDriver
        | OdspTestDriver,
): Promise<void> {
    // Currently odsp binary snapshot format only works for special file names. This won't affect any other test
    // since we have a unique dateId as prefix. So we can just add the required suffix.
    const tId = `${Date.now().toString()}-WireFormatV1RWOptimizedSnapshot_45e4`;
    const req = testDriver.createCreateNewRequest(tId);
    await container.attach(req);
    // container.close();
}

export async function createOdspUrl(
    container: IContainer,
    testDriver:
        | LocalServerTestDriver
        | TinyliciousTestDriver
        | RouterliciousTestDriver
        | OdspTestDriver,
): Promise<string> {
    const resolvedUrl = container.resolvedUrl;
    return (testDriver as OdspTestDriver).getUrlFromItemId((resolvedUrl as any).itemId);
}

export async function createOdspContainer(
    containerSchema: ContainerSchema,
    testDriver:
        | LocalServerTestDriver
        | TinyliciousTestDriver
        | RouterliciousTestDriver
        | OdspTestDriver,
    logger: TelemetryLogger,
): Promise<IContainer> {
    const loader = createOdspLoader(containerSchema, testDriver, logger);
    return loader.createDetachedContainer({
        package: "no-dynamic-package",
        config: {},
    });
}

export async function loadOdspContainer(
    containerSchema: ContainerSchema,
    testDriver:
        | LocalServerTestDriver
        | TinyliciousTestDriver
        | RouterliciousTestDriver
        | OdspTestDriver,
    logger: TelemetryLogger,
    url: string,
    headers: IRequestHeader,
): Promise<IContainer> {
    const loader2 = createOdspLoader(containerSchema, testDriver, logger);
    return loader2.resolve({ url, headers });
}

export function createOdspLoader(
    containerSchema: ContainerSchema,
    testDriver:
        | LocalServerTestDriver
        | TinyliciousTestDriver
        | RouterliciousTestDriver
        | OdspTestDriver,
    logger: TelemetryLogger,
): Loader {
    const runtimeFactory = new DOProviderContainerRuntimeFactory(containerSchema);
    const load = async (): Promise<IFluidModuleWithDetails> => {
        return {
            module: { fluidExport: runtimeFactory },
            details: { package: "no-dynamic-package", config: {} },
        };
    };

    const codeLoader = { load };
    return new Loader({
        urlResolver: testDriver.createUrlResolver(),
        documentServiceFactory: testDriver.createDocumentServiceFactory(),
        codeLoader,
        logger,
    });
}

