/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { v4 as uuid } from "uuid";
import { SharedMap, ContainerSchema } from "@fluid-experimental/fluid-framework";
import { generateUser } from "@fluidframework/server-services-client";
import {
    FrsClient,
    FrsConnectionConfig,
    FrsContainerConfig,
    InsecureTokenProvider,
} from "..";

describe("FrsClient", () => {
    // use FrsClient will run against live service. Default to running Tinylicious for PR validation
    // and local testing so it's not hindered by service availability
    const useFrs = process.env.FLUID_CLIENT === "frs";
    const tenantKey: string = useFrs ? process.env.fluid__webpack__tenantKey as string : "";
    const user = generateUser();
    const connectionConfig: FrsConnectionConfig = useFrs ? {
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
    const client = new FrsClient(connectionConfig);

    let documentId: string;
    beforeEach(() => {
        documentId = uuid();
    });

    it("can create FRS container successfully", async () => {
        const containerConfig: FrsContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
        };

        const containerAndServices  = await client.createContainer(containerConfig, schema);

        await assert.doesNotReject(
            Promise.resolve(containerAndServices),
            () => true,
            "container cannot be created in FRS",
        );
    });
});
