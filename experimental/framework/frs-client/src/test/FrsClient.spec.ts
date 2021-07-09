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

    beforeEach(() => {
        documentId = uuid();
    });

    it("can create FRS container successfully", async () => {
        const connectionConfig: FrsConnectionConfig = {
            tenantId: "",
            tokenProvider: new InsecureTokenProvider("", user),
            orderer: "",
            storage: "",
        };
        frsClient = new FrsClient(connectionConfig);
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
            "container cannot be created in FRS",
        );
    });

    it("can create Tinylicious container successfully", async () => {
        const connectionConfig: FrsConnectionConfig = {
            tenantId: "local",
            tokenProvider: new InsecureTokenProvider("fooBar", user),
            orderer: "http://localhost:7070",
            storage: "http://localhost:7070",
        };
        frsClient = new FrsClient(connectionConfig);
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
            "container cannot be created locally",
        );
    });
});
