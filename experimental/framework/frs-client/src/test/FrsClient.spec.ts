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
    let frsClient: FrsClient;
    let documentId: string;
    const user = generateUser();
    const connectionConfig: FrsConnectionConfig = {
        tenantId: "",
        tokenProvider: new InsecureTokenProvider("", user),
        orderer: "",
        storage: "",
    };
    beforeEach(() => {
        documentId = uuid();
        frsClient = new FrsClient(connectionConfig);
    });

    it("can create container successfully", async () => {
        const containerConfig: FrsContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
        };

        const containerAndServices = await frsClient.createContainer(containerConfig, schema);

        await assert.doesNotReject(
            containerAndServices,
            () => true,
            "container cannot be created",
        );
    });
});
