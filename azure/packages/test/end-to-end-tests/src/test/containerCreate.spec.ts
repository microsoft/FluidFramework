/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { AttachState } from "@fluidframework/container-definitions";
import { ContainerSchema } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { timeoutPromise } from "@fluidframework/test-utils";
import { AzureClient } from "@fluidframework/azure-client";
import { createAzureClient } from "./AzureClientFactory";

describe("Container create scenarios", () => {
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

    /**
     * Scenario: test when Azure Client is instantiated correctly, it can create
     * a container successfully.
     *
     * Expected behavior: an error should not be thrown nor should a rejected promise
     * be returned.
     */
    it("can create new Azure Fluid Relay container successfully", async () => {
        const resourcesP = client.createContainer(schema);

        await assert.doesNotReject(
            resourcesP,
            () => true,
            "container cannot be created in Azure Fluid Relay",
        );
    });

    /**
     * Scenario: test when an Azure Client container is created,
     * it is initially detached.
     *
     * Expected behavior: an error should not be thrown nor should a rejected promise
     * be returned.
     */
    it("Created container is detached", async () => {
        const { container } = await client.createContainer(schema);
        assert.strictEqual(
            container.attachState,
            AttachState.Detached,
            "Container should be detached",
        );
    });

    /**
     * Scenario: Test attaching a container.
     *
     * Expected behavior: an error should not be thrown nor should a rejected promise
     * be returned.
     */
    it("can attach a container", async () => {
        const { container } = await client.createContainer(schema);
        const containerId = await container.attach();

        await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
            durationMs: connectTimeoutMs,
            errorMsg: "container connect() timeout",
        });

        assert.strictEqual(typeof containerId, "string", "Attach did not return a string ID");
        assert.strictEqual(
            container.attachState,
            AttachState.Attached,
            "Container is not attached after attach is called",
        );
    });

    /**
     * Scenario: Test if attaching a container twice fails.
     *
     * Expected behavior: an error should not be thrown nor should a rejected promise
     * be returned.
     */
    it("cannot attach a container twice", async () => {
        const { container } = await client.createContainer(schema);
        const containerId = await container.attach();

        await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
            durationMs: connectTimeoutMs,
            errorMsg: "container connect() timeout",
        });

        assert.strictEqual(typeof containerId, "string", "Attach did not return a string ID");
        assert.strictEqual(
            container.attachState,
            AttachState.Attached,
            "Container is attached after attach is called",
        );
        await assert.rejects(container.attach(), () => true, "Container should not attach twice");
    });

    /**
     * Scenario: test if Azure Client can get an existing container.
     *
     * Expected behavior: an error should not be thrown nor should a rejected promise
     * be returned.
     */
    it("can retrieve existing Azure Fluid Relay container successfully", async () => {
        const { container: newContainer } = await client.createContainer(schema);
        const containerId = await newContainer.attach();

        await timeoutPromise((resolve) => newContainer.once("connected", () => resolve()), {
            durationMs: connectTimeoutMs,
            errorMsg: "container connect() timeout",
        });

        const resources = client.getContainer(containerId, schema);
        await assert.doesNotReject(
            resources,
            () => true,
            "container cannot be retrieved from Azure Fluid Relay",
        );
    });

    /**
     * Scenario: test if Azure Client can get a non-exiting container.
     *
     * Expected behavior: an error should be thrown when trying to get a non-existent container.
     */
    it("cannot load improperly created container (cannot load a non-existent container)", async () => {
        const consoleErrorFn = console.error;
        console.error = (): void => {};
        const containerAndServicesP = client.getContainer("containerConfig", schema);

        const errorFn = (error: Error): boolean => {
            assert.notStrictEqual(error.message, undefined, "Azure Client error is undefined");
            return true;
        };

        await assert.rejects(
            containerAndServicesP,
            errorFn,
            "Azure Client can load a non-existent container",
        );
        console.error = consoleErrorFn;
    });
});
