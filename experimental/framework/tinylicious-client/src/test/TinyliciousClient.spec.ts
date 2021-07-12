/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { v4 as uuid } from "uuid";
import { DiceRoller } from "@fluid-example/diceroller";
import { SharedMap, SharedDirectory, ContainerSchema } from "@fluid-experimental/fluid-framework";
import {
    TinyliciousClient,
    TinyliciousConnectionConfig,
    TinyliciousContainerConfig,
} from "..";

describe("TinyliciousClient", () => {
    let tinyliciousClient: TinyliciousClient;
    let documentId: string;
    beforeEach(() => {
        documentId = uuid();
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
        const containerConfig: TinyliciousContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
        };
        const containerAndServices = tinyliciousClient.createContainer(containerConfig, schema);

        await assert.doesNotReject(
            containerAndServices,
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
        const clientConfig: TinyliciousConnectionConfig = { port: 7070 };
        const clientWithPort = new TinyliciousClient(clientConfig);
        const containerConfig: TinyliciousContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
        };
        const containerAndServices = clientWithPort.createContainer(containerConfig, schema);

        await assert.doesNotReject(
            containerAndServices,
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
        const containerConfig: TinyliciousContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
        };
        const containerAndServices = tinyliciousClient.getContainer(containerConfig, schema);
        const errorFn = (error) => {
            assert.notStrictEqual(error.message, undefined, "TinyliciousClient error is undefined");
            return true;
        };

        await assert.rejects(
            containerAndServices,
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
        const containerConfig: TinyliciousContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
        };
        const containerAndServices = tinyliciousClient.createContainer(containerConfig, schema);

        await assert.doesNotReject(
            containerAndServices,
            () => true,
            "TinyliciousClient cannot create container and services successfully",
        );
    });

    /**
     * Scenario: Given the container already exists, test that TinyliciousClient can get the existing container
     * when provided with valid ContainerConfig and ContainerSchema.
     *
     * Expected behavior: containerCreate should have the identical SharedMap ID as containerGet.
     */
    it("can get a container successfully", async () => {
        const containerConfig: TinyliciousContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
        };

        const containerCreate = (await tinyliciousClient.createContainer(containerConfig, schema)).fluidContainer;
        await new Promise<void>((resolve, reject) => {
            containerCreate.on("connected", () => {
                resolve();
            });
        });

        const containerGet = (await tinyliciousClient.getContainer(containerConfig, schema)).fluidContainer;
        const map1Create = containerCreate.initialObjects.map1 as SharedMap;
        const map1Get = containerGet.initialObjects.map1 as SharedMap;
        assert.strictEqual(map1Get.id, map1Create.id, "Error getting a container");
    });

    /**
     * Scenario: test if the container can be created with an empty id in ContainerConfig
     * and an empty name in ContainerSchema.
     *
     * Expected behavior: TinyliciousClient should throw an error
     */
    it("cannot create container with empty id in containerConfig", async () => {
        const containerConfig: TinyliciousContainerConfig = { id: "" };
        const schema: ContainerSchema = {
            name: "",
            initialObjects: {
                map1: SharedMap,
            },
        };
        const containerAndServices = tinyliciousClient.createContainer(containerConfig, schema);
        const errorFn = (error) => {
            assert.notStrictEqual(error.message, undefined, "TinyliciousClient error is undefined");
            return true;
        };

        await assert.rejects(
            containerAndServices,
            errorFn,
            "TinyliciousClient can create container with empty ID",
        );
    });

    /**
     * Scenario: test if initialObjects passed into the container functions correctly.
     *
     * Expected behavior: initialObjects value loaded in two different containers should mirror
     * each other after value is changed.
     */
     it("can change initialObjects value", async () => {
        const containerConfig: TinyliciousContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
        };

        const containerCreate = (await tinyliciousClient.createContainer(containerConfig, schema)).fluidContainer;
        await new Promise<void>((resolve, reject) => {
            containerCreate.on("connected", () => {
                resolve();
            });
        });

        const initialObjectsCreate = containerCreate.initialObjects;
        const map1Create = initialObjectsCreate.map1 as SharedMap;
        map1Create.set("new-key", "new-value");
        const valueCreate = await map1Create.get("new-key");

        const containerGet = (await tinyliciousClient.getContainer(containerConfig, schema)).fluidContainer;
        const map1Get = containerGet.initialObjects.map1 as SharedMap;
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
        const containerConfig: TinyliciousContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
            dynamicObjectTypes: [ SharedDirectory ],
        };

        const container = (await tinyliciousClient.createContainer(containerConfig, schema)).fluidContainer;

        await new Promise<void>((resolve, reject) => {
            container.on("connected", () => {
                resolve();
            });
        });
        const map1 = container.initialObjects.map1 as SharedMap;
        const newPair = await container.create(SharedDirectory);
        map1.set("newpair-id", newPair.handle);
        const obj = await map1.get("newpair-id").get();
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
        const containerConfig: TinyliciousContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
            dynamicObjectTypes: [ DiceRoller ],
        };

        const createFluidContainer = (await tinyliciousClient.createContainer(containerConfig, schema)).fluidContainer;
        await new Promise<void>((resolve, reject) => {
            createFluidContainer.on("connected", () => {
                resolve();
            });
        });
        const map1 = createFluidContainer.initialObjects.map1 as SharedMap;
        const newPair = await createFluidContainer.create(DiceRoller);
        map1.set("newpair-id", newPair.handle);
        const obj = await map1.get("newpair-id").get();
        assert.strictEqual(obj.runtime.documentId, documentId, "container added dynamic objects incorrectly");
    });
});
