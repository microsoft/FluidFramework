/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { v4 as uuid } from "uuid";
import { DiceRoller } from "@fluid-example/diceroller";
import { SharedMap, SharedDirectory } from "@fluid-experimental/fluid-framework";
import { ContainerSchema } from "@fluid-experimental/fluid-static";
import {
    TinyliciousClient,
    TinyliciousConnectionConfig,
    TinyliciousContainerConfig,
} from "..";

describe("TinyliciousClient Pre-Initilization", () => {
    let documentId: string;
    beforeEach(() => {
        documentId = uuid();
    });

    /**
    * Scenario: test if TinyliciousClient can get a container without being initialized.
    *
    * Expected behavior: an error should be thrown when trying to get a container
    * without initializing TinyliciousClient.
    */
    it("get a container without initializing", async () => {
        const containerConfig: TinyliciousContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
        };
        const containerAndServices = TinyliciousClient.getContainer(containerConfig, schema);
        const errorFn = (error) => {
            assert.notStrictEqual(error.message, undefined, "TinyliciousClient error is undefined");
            return true;
        };

        await assert.rejects(
            containerAndServices,
            errorFn,
            "TinyliciousClient can get a container without initialization",
        );
    });

    /**
    * Scenario: test if TinyliciousClient can create a container without being initialized.
    *
    * Expected behavior: an error should be thrown when trying to create a container
    * without initializing TinyliciousClient.
    */
    it("create a container without initializing", async () => {
        const containerConfig: TinyliciousContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
        };
        const containerAndServices = TinyliciousClient.createContainer(containerConfig, schema);
        const errorFn = (error) => {
            assert.notStrictEqual(error.message, undefined, "TinyliciousClient error is undefined");
            return true;
        };

        await assert.rejects(
            containerAndServices,
            errorFn,
            "TinyliciousClient can create a container without initialization",
        );
    });
});

describe("TinyliciousClient Post-Initialization", () => {
    before(() => {
        TinyliciousClient.init();
    });

    let documentId: string;
    const clientConfig: TinyliciousConnectionConfig = { port: 7070 };
    beforeEach(() => {
        documentId = uuid();
    });

    /**
    * Scenario: test if TinyliciousClient can get a non-exiting container.
    *
    * Expected behavior: an error should be thrown when trying to get a non-exisitng container.
    */
    it("load improperly created container (load a non-existing container)", async () => {
        const containerConfig: TinyliciousContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
        };
        const containerAndServices = TinyliciousClient.getContainer(containerConfig, schema);
        const errorFn = (error) => {
            assert.notStrictEqual(error.message, undefined, "TinyliciousClient error is undefined");
            return true;
        };

        await assert.rejects(
            containerAndServices,
            errorFn,
            "TinyliciousClient can load a non-existing container",
        );
    });

    /**
    * Scenario: test if TinyliciousClient can be initialized with a port number specified.
    *
    * Expected behavior: returned container should not be undefined.
    */
    it("create a container successfully with port number specification", async () => {
        TinyliciousClient.init(clientConfig);
        const containerConfig: TinyliciousContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
        };
        const [container] = await TinyliciousClient.createContainer(containerConfig, schema);
        await new Promise<void>((resolve, reject) => {
            container.on("connected", () => {
                resolve();
            });
        });
        assert.notStrictEqual(container, undefined, "container cannot be created with port number");
    });

    /**
    * Scenario: test when TinyliciousClient is initialized correctly, it can create
    * a container successfully.
    *
    * Expected behavior: returned container should not be undefined.
    */
    it("can create a container successfully", async () => {
        const containerConfig: TinyliciousContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
        };
        const [container] = await TinyliciousClient.createContainer(containerConfig, schema);
        await new Promise<void>((resolve, reject) => {
            container.on("connected", () => {
                resolve();
            });
        });
        assert.notStrictEqual(container, undefined, "Container cannot be created");
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
        const [containerCreate] = await TinyliciousClient.createContainer(containerConfig, schema);
        await new Promise<void>((resolve, reject) => {
            containerCreate.on("connected", () => {
                resolve();
            });
        });
        const [containerGet] = await TinyliciousClient.getContainer(containerConfig, schema);
        const map1Create = containerCreate.initialObjects.map1 as SharedMap;
        const map1Get = containerGet.initialObjects.map1 as SharedMap;
        assert.strictEqual(map1Get.id, map1Create.id, "Error getting a container");
    });

    /**
    * Scenario: test if given the appropriate COntainerConfig and ContainerSchema,
    * TinyliciousClient.createContainer will return the a valid ContainerServices.
    *
    * Expected behavior: the returned containerServices should not be undefined
    */
    it("can get containerServices successfully", async () => {
        const containerConfig: TinyliciousContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
        };
        const [,containerService] = await TinyliciousClient.createContainer(containerConfig, schema);
        assert.notStrictEqual(containerService, undefined, "ContainerServices invalid");
    });

    /**
    * Scenario: test if an initialized TinyliciousClient can create container successfully when
    * it is already initialized.
    *
    * Expected behavior: TinyliciousClient should use the existing instance instead of creating
    * a new instance, then proceed to create a container.
    */
    it("initializing an initialized TinyliciousClient", async () => {
        TinyliciousClient.init(clientConfig);
        const containerConfig: TinyliciousContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
        };
        const [container] = await TinyliciousClient.createContainer(containerConfig, schema);
        await new Promise<void>((resolve, reject) => {
            container.on("connected", () => {
                resolve();
            });
        });
        assert.notStrictEqual(container, undefined, "container is connected");
    });

    /**
    * Scenario: test if the container can be created with an empty id in ContainerConfig
    * and an empty name in ContainerSchema.
    *
    * Expected behavior: TinyliciousClient should throw an error
    */
    it("create container with empty id in containerConfig", async () => {
        const containerConfig: TinyliciousContainerConfig = { id: "" };
        const schema: ContainerSchema = {
            name: "",
            initialObjects: {
                map1: SharedMap,
            },
        };
        const containerAndServices = TinyliciousClient.createContainer(containerConfig, schema);
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
    * Scenario: test if the initial objects that are passed in as parameter can be
    * returned by the container.
    *
    * Expected behavior: initialObject ID is not empty.
    */
    it("use container to retrieve initial objects", async () => {
        const containerConfig: TinyliciousContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
        };
        const [container] = await TinyliciousClient.createContainer(containerConfig, schema);
        await new Promise<void>((resolve, reject) => {
            container.on("connected", () => {
                resolve();
            });
        });
        const initialObjects = container.initialObjects;
        const map1 = initialObjects.map1 as SharedMap;
        assert.notStrictEqual(map1.id, "", "container can't connect with dynamic objects");
    });

    /**
    * Scenario: test if the optional schema parameter, dynamicObjectTypes (DDS),
    * can be added during runtime and be returned by the container.
    *
    * Expected behavior: added loadable object can be retreived from the container. Loadable
    * object's id and containeronfig ID should be identical since it's now attached to
    * the container.
    */
    it("create/add loadable objects (DDS) dynamically during runtime", async () => {
        const containerConfig: TinyliciousContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
            dynamicObjectTypes: [ SharedDirectory ],
        };
        const [container] = await TinyliciousClient.createContainer(containerConfig, schema);
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
    * Scenario: test if the optional schema parameter, dynamicObjectTypes (custom data object),
    * can be added during runtime and be returned by the container.
    *
    * Expected behavior: added loadable object can be retreived from the container. Loadable
    * object's id and containeronfig ID should be identical since it's now attached to
    * the container.
    */
    it("create/add loadable objects (custom data object) dynamically during runtime", async () => {
        const containerConfig: TinyliciousContainerConfig = { id: documentId };
        const schema: ContainerSchema = {
            name: documentId,
            initialObjects: {
                map1: SharedMap,
            },
            dynamicObjectTypes: [ DiceRoller ],
        };
        const [container] = await TinyliciousClient.createContainer(containerConfig, schema);
        await new Promise<void>((resolve, reject) => {
            container.on("connected", () => {
                resolve();
            });
        });
        const map1 = container.initialObjects.map1 as SharedMap;
        const newPair = await container.create(DiceRoller);
        map1.set("newpair-id", newPair.handle);
        const obj = await map1.get("newpair-id").get();
        assert.strictEqual(obj.runtime.documentId, documentId, "container added dynamic objects incorrectly");
    });
});
