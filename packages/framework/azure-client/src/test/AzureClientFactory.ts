/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { generateUser } from "@fluidframework/server-services-client";
import { InsecureTokenProvider } from "@fluidframework/test-client-utils";
import {
    AzureClient, AzureFunctionTokenProvider,
} from "..";

// This function will determine if local or remote mode is required (based on azureTokenProvider),
// and return a new AzureClient instance based on the mode by setting the Connection config
// accordingly.
export function createAzureClient(azureTokenProvider?: AzureFunctionTokenProvider): AzureClient {
    const tenantId = azureTokenProvider ? process.env.fluid__webpack__tenantId as string : "frs-client-tenant";
    const user = generateUser();

    // use azureTokenProvider remote mode will run against live Azure Relay Service.
    // Default to running Tinylicious for PR validation
    // and local testing so it's not hindered by service availability
    const connectionProps = azureTokenProvider ? {
        tenantId,
        tokenProvider: azureTokenProvider,
        orderer: "https://alfred.westus2.fluidrelay.azure.com",
        storage: "https://historian.westus2.fluidrelay.azure.com",
    } : {
        tenantId: "local",
        tokenProvider: new InsecureTokenProvider("fooBar", user),
        orderer: "http://localhost:7070",
        storage: "http://localhost:7070",
    };
    return new AzureClient({ connection: connectionProps });
}
