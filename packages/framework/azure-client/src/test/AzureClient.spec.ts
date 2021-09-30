/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { AttachState } from "@fluidframework/container-definitions";
import { ContainerSchema } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { createAzureClient } from "./AzureClientFactory";

describe("AzureClient", () => {
    const client = createAzureClient();
    const schema: ContainerSchema = {
        initialObjects: {
            map1: SharedMap,
        },
    };

    it("can create new Azure Fluid Relay container successfully", async () => {
        const resources = client.createContainer(schema);

        await assert.doesNotReject(
            resources,
            () => true,
            "container cannot be created in Azure Fluid Relay",
        );

        const { container } = await resources;
        assert.notStrictEqual(Object.keys(container.initialObjects), Object.keys(schema.initialObjects));
    });

    it("Created container is detached", async () => {
        const { container } = await client.createContainer(schema);
        assert.strictEqual(container.attachState, AttachState.Detached, "Container should be detached");
    });

    it("Can attach container", async () => {
        const { container } = await client.createContainer(schema);
        const containerId = await container.attach();

        assert.strictEqual(
            typeof(containerId), "string",
            "Attach did not return a string ID",
        );
        assert.strictEqual(
            container.attachState, AttachState.Attached,
            "Container is not attached after attach is called",
        );
        await assert.rejects(
            container.attach(),
            () => true,
            "Container should not attached twice",
        );
    });

    it("can retrieve existing Azure Fluid Relay container successfully", async () => {
        const { container: newContainer } = await client.createContainer(schema);
        const containerId = await newContainer.attach();
        await new Promise<void>((resolve, reject) => {
            newContainer.on("connected", () => {
                resolve();
            });
        });

        const resources = client.getContainer(containerId, schema);
        await assert.doesNotReject(
            resources,
            () => true,
            "container cannot be retrieved from Azure Fluid Relay",
        );

        const { container } = await resources;
        assert.notStrictEqual(Object.keys(container.initialObjects), Object.keys(schema.initialObjects));
    });
});
