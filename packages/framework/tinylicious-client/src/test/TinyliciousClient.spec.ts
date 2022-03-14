/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line unicorn/prefer-node-protocol
import { strict as assert } from "assert";
import { AttachState } from "@fluidframework/container-definitions";
import { ContainerSchema } from "@fluidframework/fluid-static";
import { SharedMap, SharedDirectory } from "@fluidframework/map";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { TinyliciousClient } from "..";
import { TestDataObject } from "./TestDataObject";

describe("TinyliciousClient", () => {
    let tinyliciousClient: TinyliciousClient;
    const schema: ContainerSchema = {
        initialObjects: {
            map1: SharedMap,
        },
    };
    beforeEach(() => {
        tinyliciousClient = new TinyliciousClient();
    });

    /**
     * Scenario: test if TinyliciousClient can be instantiated without a port
     * number specified.
     *
     * Expected behavior: an error should not be thrown nor should a rejected promise
     * be returned.
     */
    it("can create instance without specifying port number", async () => {
        const containerAndServicesP = tinyliciousClient.createContainer(schema);

        await assert.doesNotReject(
            containerAndServicesP,
            () => true,
            "container cannot be created without specifying port number",
        );
    });

    /**
     * Scenario: test if TinyliciousClient can be instantiated with a port number specified.
     *
     * Expected behavior: an error should not be thrown nor should a rejected promise
     * be returned.
     */
    it("can create a container successfully with port number specification", async () => {
        const clientProps = { connection: { port: 7070 } };
        const clientWithPort = new TinyliciousClient(clientProps);

        const containerAndServicesP = clientWithPort.createContainer(schema);

        await assert.doesNotReject(
            containerAndServicesP,
            () => true,
            "container cannot be created with port number",
        );
    });

    /**
     * Scenario: test if TinyliciousClient can get a non-exiting container.
     *
     * Expected behavior: an error should be thrown when trying to get a non-exisitent container.
     */
    it("cannot load improperly created container (cannot load a non-existent container)", async () => {
        const containerAndServicesP = tinyliciousClient.getContainer("containerConfig", schema);

        const errorFn = (error) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            assert.notStrictEqual(error.message, undefined, "TinyliciousClient error is undefined");
            return true;
        };

        await assert.rejects(
            containerAndServicesP,
            errorFn,
            "TinyliciousClient can load a non-existent container",
        );
    });

    /**
     * Scenario: test when TinyliciousClient is instantiated correctly, it can create
     * a container successfully.
     *
     * Expected behavior: an error should not be thrown nor should a rejected promise
     * be returned.
     */
    it("can create a container and services successfully", async () => {
        const containerAndServicesP = tinyliciousClient.createContainer(schema);

        await assert.doesNotReject(
            containerAndServicesP,
            () => true,
            "TinyliciousClient cannot create container and services successfully",
        );
    });

    it("creates a container with detached state", async () => {
        const { container } = await tinyliciousClient.createContainer(schema);
        assert.strictEqual(
            container.attachState, AttachState.Detached,
            "Container should be detached after creation",
        );
    });

    it("creates a container that can only be attached once", async () => {
        const { container } = await tinyliciousClient.createContainer(schema);
        const containerId = await container.attach();

        assert.strictEqual(
            typeof (containerId), "string",
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

    /**
     * Scenario: Given the container already exists, test that TinyliciousClient can get the existing container
     * when provided with valid ContainerConfig and ContainerSchema.
     *
     * Expected behavior: containerCreate should have the identical SharedMap ID as containerGet.
     */
    it("can get a container successfully", async () => {
        const { container: containerCreate } = await tinyliciousClient.createContainer(schema);
        const containerId = await containerCreate.attach();
        await new Promise<void>((resolve, reject) => {
            containerCreate.on("connected", () => {
                resolve();
            });
        });

        const { container: containerGet } = await tinyliciousClient.getContainer(containerId, schema);
        const map1Create = containerCreate.initialObjects.map1 as SharedMap;
        const map1Get = containerGet.initialObjects.map1 as SharedMap;
        assert.strictEqual(map1Get.id, map1Create.id, "Error getting a container");
    });

    /**
     * Scenario: test if initialObjects passed into the container functions correctly.
     *
     * Expected behavior: initialObjects value loaded in two different containers should mirror
     * each other after value is changed.
     */
    it("can change initialObjects value", async () => {
        const { container: containerCreate } = await tinyliciousClient.createContainer(schema);
        const containerId = await containerCreate.attach();
        await new Promise<void>((resolve, reject) => {
            containerCreate.on("connected", () => {
                resolve();
            });
        });

        const initialObjectsCreate = containerCreate.initialObjects;
        const map1Create = initialObjectsCreate.map1 as SharedMap;
        map1Create.set("new-key", "new-value");
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const valueCreate = await map1Create.get("new-key");

        const { container: containerGet } = await tinyliciousClient.getContainer(containerId, schema);
        const map1Get = containerGet.initialObjects.map1 as SharedMap;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const valueGet = await map1Get.get("new-key");
        assert.strictEqual(valueGet, valueCreate, "container can't connect with initial objects");
    });

    /**
     * Scenario: test if the optional schema parameter, dynamicObjectTypes (DDS),
     * can be added during runtime and be returned by the container.
     *
     * Expected behavior: added loadable object can be retrieved from the container. Loadable
     * object's id and containeronfig ID should be identical since it's now attached to
     * the container.
     */
    it("can create/add loadable objects (DDS) dynamically during runtime", async () => {
        const dynamicSchema: ContainerSchema = {
            initialObjects: {
                map1: SharedMap,
            },
            dynamicObjectTypes: [SharedDirectory],
        };

        const { container } = await tinyliciousClient.createContainer(dynamicSchema);
        await container.attach();
        await new Promise<void>((resolve, reject) => {
            container.on("connected", () => {
                resolve();
            });
        });

        const map1 = container.initialObjects.map1 as SharedMap;
        const newPair = await container.create(SharedDirectory);
        map1.set("newpair-id", newPair.handle);
        const hdl = await map1.get("newpair-id") as IFluidHandle;
        const obj = await hdl.get() as SharedDirectory;
        assert.strictEqual(obj[Symbol.toStringTag], "SharedDirectory", "container added dynamic objects incorrectly");
    });

    /**
     * Scenario: test if the optional schema parameter, dynamicObjectTypes (custom data objects),
     * can be added during runtime and be returned by the container.
     *
     * Expected behavior: added loadable object can be retrieved from the container. Loadable
     * object's id and containeronfig ID should be identical since it's now attached to
     * the container.
     */
    it("can create/add loadable objects (custom data object) dynamically during runtime", async () => {
        const dynamicSchema: ContainerSchema = {
            initialObjects: {
                map1: SharedMap,
            },
            dynamicObjectTypes: [TestDataObject],
        };

        const { container: createFluidContainer } = await tinyliciousClient.createContainer(dynamicSchema);
        await createFluidContainer.attach();
        await new Promise<void>((resolve, reject) => {
            createFluidContainer.on("connected", () => {
                resolve();
            });
        });

        const newPair = await createFluidContainer.create(TestDataObject);
        assert.ok(newPair?.handle);

        const map1 = createFluidContainer.initialObjects.map1 as SharedMap;
        map1.set("newpair-id", newPair.handle);
        const hdl = await map1.get("newpair-id") as IFluidHandle;
        const obj = await hdl.get() as TestDataObject;
        assert.ok(obj, "container added dynamic objects incorrectly");
    });
});
