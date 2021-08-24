/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { SharedMap, ContainerSchema } from "fluid-framework";
import { AttachState } from "@fluidframework/container-definitions";
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
        const resources = client.createContainer(schema);

        await assert.doesNotReject(
            resources,
            () => true,
            "container cannot be created in FRS",
        );

        const { fluidContainer } = await resources;
        assert.equal(Object.keys(fluidContainer.initialObjects), Object.keys(schema.initialObjects));
    });

    it("Created container is detached", async () => {
        const { fluidContainer } = await client.createContainer(schema);
        assert.strictEqual(fluidContainer.attachState, AttachState.Detached, "Container should be detached");
    });

    it("Can attach container", async () => {
        const {fluidContainer} = await client.createContainer(schema);
        const containerId = await fluidContainer.attach();

        assert.strictEqual(
            typeof(containerId) === "string",
            "Attach did not return a string ID",
        );
        assert.strictEqual(
            fluidContainer.attachState, AttachState.Attached,
            "Container is not attached after attach is called",
        );
        await assert.rejects(
            fluidContainer.attach(),
            ()=> true,
            "Container should not attached twice",
        );
    });

    it("can retrieve existing FRS container successfully", async () => {
        const { fluidContainer: newContainer } = await client.createContainer(schema);
        const containerId = await newContainer.attach();

        const resources = client.getContainer(containerId, schema);
        await assert.doesNotReject(
            resources,
            () => true,
            "container cannot be retrieved from FRS",
        );

        const { fluidContainer } = await resources;
        assert.equal(Object.keys(fluidContainer.initialObjects), Object.keys(schema.initialObjects));
    });
});
