/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { generateUser } from "@fluidframework/server-services-client";
import { InsecureTokenProvider } from "@fluidframework/test-client-utils";
import {
    AzureClient,
    LOCAL_MODE_TENANT_ID,
} from "..";

// This function will detemine if local or remote mode is required (based on FLUID_CLIENT),
// and return a new AzureClient instance based on the mode by setting the Connection config
// accordingly.
export function createAzureClient(): AzureClient {
    const useAzure = process.env.FLUID_CLIENT === "azure";
    const tenantId = useAzure ? process.env.fluid__webpack__tenantId as string : "frs-client-tenant";
    const tenantKey = useAzure ? process.env.fluid__webpack__tenantKey as string : "";
    const user = generateUser();

    // use AzureClient remote mode will run against live Azure Relay Service.
    // Default to running Tinylicious for PR validation
    // and local testing so it's not hindered by service availability
    const connectionProps = useAzure ? {
        tenantId,
        tokenProvider: new InsecureTokenProvider(
            tenantKey, user,
        ),
        orderer: "https://alfred.eus-1.canary.frs.azure.com",
        storage: "https://historian.eus-1.canary.frs.azure.com",
    } : {
        tenantId: LOCAL_MODE_TENANT_ID,
        tokenProvider: new InsecureTokenProvider("fooBar", user),
        orderer: "http://localhost:7070",
        storage: "http://localhost:7070",
    };
    return new AzureClient({ connection:connectionProps });
}
