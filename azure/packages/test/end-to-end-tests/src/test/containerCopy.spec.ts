/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";
import { AttachState } from "@fluidframework/container-definitions";
import { ContainerSchema } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { timeoutPromise } from "@fluidframework/test-utils";
import { AzureClient } from "@fluidframework/azure-client";
import { createAzureClient } from "./AzureClientFactory";
import { mapWait } from "./utils";

describe("Container copy scenarios", () => {
    const connectTimeoutMs = 1000;
    let client: AzureClient;
    let schema: ContainerSchema;

    beforeEach(() => {
        client = createAzureClient();
        schema = {
            initialObjects: {
                map1: SharedMap,
            },
        };
    });

    beforeEach(async function () {
        if (process.env.FLUID_CLIENT !== "azure") {
            this.skip();
        }
    });

    /**
     * Scenario: test if Azure Client can provide versions of the container.
     *
     * Expected behavior: an error should not be thrown nor should a rejected promise
     * be returned. Upon creation, we should recieve back 1 version of the container.
     */
    it("can get versions of current document", async () => {
        const { container } = await client.createContainer(schema);
        const containerId = await container.attach();

        await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
            durationMs: connectTimeoutMs,
            errorMsg: "container connect() timeout",
        });
        const resources = client.getContainerVersions(containerId);
        await assert.doesNotReject(
            resources,
            () => true,
            "could not get versions of the container",
        );

        const versions = await resources;
        assert.strictEqual(versions.length, 1, "Container should have exactly one version.");
    });

    /**
     * Scenario: test if Azure Client can handle bad version ID when versions are requested.
     *
     * Expected behavior: Client should throw an error.
     */
    it("can handle bad versions of current document", async () => {
        const resources = client.getContainerVersions("badid");
        await assert.rejects(
            resources,
            () => true,
            "We should not be able to get container versions.",
        );
    });

    /**
     * Scenario: test if Azure Client can copy existing container.
     *
     * Expected behavior: an error should not be thrown nor should a rejected promise
     * be returned.
     */
    it("can copy document successfully", async () => {
        const { container } = await client.createContainer(schema);
        const containerId = await container.attach();

        await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
            durationMs: connectTimeoutMs,
            errorMsg: "container connect() timeout",
        });
        const resources = client.copyContainer(containerId, schema);
        await assert.doesNotReject(resources, () => true, "container could not be copied");

        const { container: containerCopy } = await resources;

        const newContainerId = await containerCopy.attach();
        await timeoutPromise((resolve) => containerCopy.once("connected", () => resolve()), {
            durationMs: connectTimeoutMs,
            errorMsg: "container connect() timeout",
        });

        assert.strictEqual(typeof newContainerId, "string", "Attach did not return a string ID");
        assert.strictEqual(
            containerCopy.attachState,
            AttachState.Attached,
            "Container is not attached after attach is called",
        );
    });

    /**
     * Scenario: test if Azure Client can copy existing container at specific version.
     *
     * Expected behavior: an error should not be thrown nor should a rejected promise
     * be returned.
     */
    it("can sucesfully copy document from a specific version", async () => {
        const { container } = await client.createContainer(schema);
        const containerId = await container.attach();

        await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
            durationMs: connectTimeoutMs,
            errorMsg: "container connect() timeout",
        });

        const versions = await client.getContainerVersions(containerId);
        assert.strictEqual(versions.length, 1, "Container should have exactly one version.");

        const resources = client.copyContainer(containerId, schema, versions[0]);
        await assert.doesNotReject(resources, () => true, "container could not be copied");

        const { container: containerCopy } = await resources;

        const newContainerId = await containerCopy.attach();
        await timeoutPromise((resolve) => containerCopy.once("connected", () => resolve()), {
            durationMs: connectTimeoutMs,
            errorMsg: "container connect() timeout",
        });

        assert.strictEqual(typeof newContainerId, "string", "Attach did not return a string ID");
        assert.strictEqual(
            containerCopy.attachState,
            AttachState.Attached,
            "Container is not attached after attach is called",
        );
    });

    /**
     * Scenario: test if Azure Client properly handles DDS objects when
     * copying existing container.
     *
     * Expected behavior: DDS values should match across original and copied
     * container.
     */
    it("correctly copies DDS values when copying container", async () => {
        const { container } = await client.createContainer(schema);

        const initialObjectsCreate = container.initialObjects;
        const map1Create = initialObjectsCreate.map1 as SharedMap;
        map1Create.set("new-key", "new-value");
        const valueCreate: string | undefined = map1Create.get("new-key");

        const containerId = await container.attach();

        await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
            durationMs: connectTimeoutMs,
            errorMsg: "container connect() timeout",
        });

        const resources = client.copyContainer(containerId, schema);
        await assert.doesNotReject(resources, () => true, "container could not be copied");

        const { container: containerCopy } = await resources;

        const map1Get = containerCopy.initialObjects.map1 as SharedMap;
        const valueGet: string | undefined = await mapWait(map1Get, "new-key");
        assert.strictEqual(valueGet, valueCreate, "DDS value was not correctly copied.");
    });

    /**
     * Scenario: test if Azure Client can handle non-existing container when trying to copy
     *
     * Expected behavior: client should throw an error.
     */
    it("can handle non-existing container", async () => {
        const resources = client.copyContainer("badidoncopy", schema);
        await assert.rejects(resources, () => true, "We should not be able to copy container.");
    });
});
