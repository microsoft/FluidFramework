/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { AttachState } from "@fluidframework/container-definitions";
import { ContainerSchema } from "@fluidframework/fluid-static";
import { ISharedMap, IValueChanged, SharedMap } from "@fluidframework/map";
import { AzureClient } from "../AzureClient";
import { createAzureClient } from "./AzureClientFactory";
import { TestDataObject } from "./TestDataObject";

const mapWait = async <T = any>(map: ISharedMap, key: string): Promise<T> => {
    const maybeValue = map.get<T>(key);
    if (maybeValue !== undefined) {
        return maybeValue;
    }

    return new Promise((resolve) => {
        const handler = (changed: IValueChanged) => {
            if (changed.key === key) {
                map.off("valueChanged", handler);
                const value = map.get<T>(changed.key);
                if (value === undefined) {
                    throw new Error("Unexpected valueChanged result");
                }
                resolve(value);
            }
        };
        map.on("valueChanged", handler);
    });
};

describe("AzureClient", () => {
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
        assert.strictEqual(container.attachState, AttachState.Detached, "Container should be detached");
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
        await new Promise<void>((resolve) => {
            container.on("connected", () => {
                resolve();
            });
        });

        assert.strictEqual(
            typeof (containerId), "string",
            "Attach did not return a string ID",
        );
        assert.strictEqual(
            container.attachState, AttachState.Attached,
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
        await new Promise<void>((resolve) => {
            container.on("connected", () => {
                resolve();
            });
        });

        assert.strictEqual(
            typeof (containerId), "string",
            "Attach did not return a string ID",
        );
        assert.strictEqual(
            container.attachState, AttachState.Attached,
            "Container is attached after attach is called",
        );
        await assert.rejects(
            container.attach(),
            () => true,
            "Container should not attach twice",
        );
    });

    /**
     * Scenario: test if Azure Client can get an existing container.
     *
     * Expected behavior: an error should not be thrown nor should a rejected promise
     * be returned.
     */
    it("can retrieve existing Azure Fluid Relay container successfully", async () => {
        const newContainer = (await client.createContainer(schema)).container;
        const containerId = await newContainer.attach();
        await new Promise<void>((resolve) => {
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
    });

    /**
     * Scenario: test if Azure Client can get a non-exiting container.
     *
     * Expected behavior: an error should be thrown when trying to get a non-existent container.
     */
    it("cannot load improperly created container (cannot load a non-existent container)", async () => {
        const consoleErrorFn = console.error;
        console.error = () => { };
        const containerAndServicesP = client.getContainer("containerConfig", schema);

        const errorFn = (error) => {
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

    /**
     * Scenario: test when an Azure Client container is created,
     * it can set the initial objects.
     *
     * Expected behavior: an error should not be thrown nor should a rejected promise
     * be returned.
     */
    it("can set initial objects for a container", async () => {
        const newContainer = (await client.createContainer(schema)).container;
        const containerId = await newContainer.attach();
        await new Promise<void>((resolve) => {
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

        const container = (await resources).container;
        assert.deepStrictEqual(Object.keys(container.initialObjects), Object.keys(schema.initialObjects));
    });

    /**
     * Scenario: test if initialObjects passed into the container functions correctly.
     *
     * Expected behavior: initialObjects value loaded in two different containers should mirror
     * each other after value is changed.
     */
    it("can change initialObjects value", async () => {
        const container = (await client.createContainer(schema)).container;
        const containerId = await container.attach();
        await new Promise<void>((resolve) => {
            container.once("connected", () => {
                resolve();
            });
        });

        const initialObjectsCreate = container.initialObjects;
        const map1Create = initialObjectsCreate.map1 as SharedMap;
        map1Create.set("new-key", "new-value");
        const valueCreate = await map1Create.get("new-key");

        const containerGet = (await client.getContainer(containerId, schema)).container;
        const map1Get = containerGet.initialObjects.map1 as SharedMap;
        const valueGet = await mapWait(map1Get, "new-key");
        assert.strictEqual(valueGet, valueCreate, "container can't change initial objects");
    });

    /**
     * Scenario: test if the optional schema parameter, dynamicObjectTypes (custom data objects),
     * can be added during runtime and be returned by the container.
     *
     * Expected behavior: added loadable object can be retrieved from the container. Loadable
     * object's id and container config ID should be identical since it's now attached to
     * the container.
     */
    it("can create/add loadable objects (custom data object) dynamically during runtime", async () => {
        const dynamicSchema: ContainerSchema = {
            initialObjects: {
                map1: SharedMap,
            },
            dynamicObjectTypes: [TestDataObject],
        };

        const createFluidContainer = (await client.createContainer(dynamicSchema)).container;

        const newPair = await createFluidContainer.create(TestDataObject);
        assert.ok(newPair?.handle);

        const map1 = createFluidContainer.initialObjects.map1 as SharedMap;
        map1.set("new-pair-id", newPair.handle);
        const obj = await map1.get("new-pair-id").get();
        assert.ok(obj, "container added dynamic objects incorrectly");
    });
});
