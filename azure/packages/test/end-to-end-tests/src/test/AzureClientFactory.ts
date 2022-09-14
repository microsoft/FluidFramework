/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { generateUser } from "@fluidframework/server-services-client";
import { InsecureTokenProvider } from "@fluidframework/test-client-utils";
import {
    AzureClient,
    AzureLocalConnectionConfig,
    AzureRemoteConnectionConfig,
} from "@fluidframework/azure-client";
import { createAzureTokenProvider } from "./AzureTokenFactory";

/**
 * This function will determine if local or remote mode is required (based on FLUID_CLIENT), and return a new
 * {@link AzureClient} instance based on the mode by setting the Connection config accordingly.
 */
export function createAzureClient(userID?: string, userName?: string): AzureClient {
    const useAzure = process.env.FLUID_CLIENT === "azure";
    const tenantId = useAzure
        ? (process.env.azure__fluid__relay__service__tenantId as string)
        : "frs-client-tenant";

    // use AzureClient remote mode will run against live Azure Fluid Relay.
    // Default to running Tinylicious for PR validation
    // and local testing so it's not hindered by service availability
    const connectionProps: AzureRemoteConnectionConfig | AzureLocalConnectionConfig = useAzure
        ? {
              tenantId,
              tokenProvider: createAzureTokenProvider(userID, userName),
              endpoint: "https://alfred.westus2.fluidrelay.azure.com",
              type: "remote",
          }
        : {
              tokenProvider: new InsecureTokenProvider("fooBar", generateUser()),
              endpoint: "http://localhost:7071",
              type: "local",
          };
    return new AzureClient({ connection: connectionProps });
}
