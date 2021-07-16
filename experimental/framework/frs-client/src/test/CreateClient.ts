/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { generateUser } from "@fluidframework/server-services-client";
import {
    FrsClient,
    FrsConnectionConfig,
    InsecureTokenProvider,
} from "..";

export class CreateClient {
    // use FrsClient remote mode will run against live Frs service. Default to running Tinylicious for PR validation
    // and local testing so it's not hindered by service availability
    private readonly useFrs: boolean;
    private readonly user: any;
    private readonly tenantKey: string;
    private readonly connectionConfig: FrsConnectionConfig;

    constructor() {
        this.useFrs = process.env.FLUID_CLIENT === "frs";
        this.tenantKey = this.useFrs ? process.env.fluid__webpack__tenantKey as string : "";
        this.user = generateUser();
        this.connectionConfig = this.useFrs ? {
            tenantId: "frs-client-tenant",
            tokenProvider: new InsecureTokenProvider(
                this.tenantKey, this.user,
            ),
            orderer: "https://alfred.eus-1.canary.frs.azure.com",
            storage: "https://historian.eus-1.canary.frs.azure.com",
        } : {
            tenantId: "local",
            tokenProvider: new InsecureTokenProvider("fooBar", this.user),
            orderer: "http://localhost:7070",
            storage: "http://localhost:7070",
        };
    }

    public create(): FrsClient {
        return new FrsClient(this.connectionConfig);
    }
}
