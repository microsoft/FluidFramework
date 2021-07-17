/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { generateUser } from "@fluidframework/server-services-client";
import {
    FrsClient,
    InsecureTokenProvider,
} from "..";

// This function will detemine if local or remote mode is required (based on FLUID_CLIENT),
// and return a new FrsClient instance based on the mode by setting the ConnectionConfig
// accordingly.
export function createFrsClient(): FrsClient {
    const useFrs = process.env.FLUID_CLIENT === "frs";
    const tenantKey = useFrs ? process.env.fluid__webpack__tenantKey as string : "";
    const user = generateUser();

    // use FrsClient remote mode will run against live Frs service. Default to running Tinylicious for PR validation
    // and local testing so it's not hindered by service availability
    const connectionConfig = useFrs ? {
        tenantId: "frs-client-tenant",
        tokenProvider: new InsecureTokenProvider(
            tenantKey, user,
        ),
        orderer: "https://alfred.eus-1.canary.frs.azure.com",
        storage: "https://historian.eus-1.canary.frs.azure.com",
    } : {
        tenantId: "local",
        tokenProvider: new InsecureTokenProvider("fooBar", user),
        orderer: "http://localhost:7070",
        storage: "http://localhost:7070",
    };
    return new FrsClient(connectionConfig);
}
