/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { SharedMap, ContainerSchema } from "fluid-framework";
import { createAzureClient } from "./AzureClientFactory";

describe("AzureClient", () => {
    const client = createAzureClient();
    const schema: ContainerSchema = {
        name: "azure-client-test",
        initialObjects: {
            map1: SharedMap,
        },
    };

    it("can create new FRS container successfully", async () => {
        const containerAndServicesP = client.createContainer(schema);

        await assert.doesNotReject(
            containerAndServicesP,
            () => true,
            "container cannot be created in FRS",
        );

        const { fluidContainer } = await containerAndServicesP;
        assert.ok(fluidContainer.id);
    });

    it("can retrieve existing FRS container successfully", async () => {
        const { fluidContainer: newContainer } = await client.createContainer(schema);
        const containerId = newContainer.id;

        const containerAndServicesP = client.getContainer(containerId, schema);
        await assert.doesNotReject(
            containerAndServicesP,
            () => true,
            "container cannot be retrieved from FRS",
        );

        const { fluidContainer } = await containerAndServicesP;
        assert.equal(fluidContainer.id, containerId);
    });
});
