/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { AttachState, ContainerErrorType } from "@fluidframework/container-definitions";
import {
    ContainerMessageType,
} from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import { SharedMap, SharedDirectory } from "@fluidframework/map";
import { TinyliciousClient } from "..";
import { TestDataObject } from "./TestDataObject";

const corruptedAliasOp = async (runtime: IContainerRuntime, alias: string): Promise<boolean | Error> =>
new Promise<boolean>((resolve, reject) => {
    runtime.once("dispose", () => reject(new Error("Runtime disposed")));
    (runtime as any).submit(ContainerMessageType.Alias, { id: alias }, resolve);
}).catch((error) => new Error(error.message));

const runtimeOf = (dataObject: TestDataObject): IContainerRuntime =>
    (dataObject as any).context.containerRuntime as IContainerRuntime;

const allDataCorruption = async (containers: IFluidContainer[]) => Promise.all(
    containers.map(async (c) => new Promise<boolean>((resolve) => c.once("disposed", (error) => {
        resolve(error?.errorType === ContainerErrorType.dataCorruptionError);
    })))).then((all) => !all.includes(false));

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
        const container = (await tinyliciousClient.createContainer(schema)).container;
        assert.strictEqual(
            container.attachState, AttachState.Detached,
            "Container should be detached after creation",
        );
    });

    it("creates a container that can only be attached once", async () => {
        const container = (await tinyliciousClient.createContainer(schema)).container;
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
        const containerCreate = (await tinyliciousClient.createContainer(schema)).container;
        const containerId = await containerCreate.attach();
        await new Promise<void>((resolve, reject) => {
            containerCreate.on("connected", () => {
                resolve();
            });
        });

        const containerGet = (await tinyliciousClient.getContainer(containerId, schema)).container;
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
        const containerCreate = (await tinyliciousClient.createContainer(schema)).container;
        const containerId = await containerCreate.attach();
        await new Promise<void>((resolve, reject) => {
            containerCreate.on("connected", () => {
                resolve();
            });
        });

        const initialObjectsCreate = containerCreate.initialObjects;
        const map1Create = initialObjectsCreate.map1 as SharedMap;
        map1Create.set("new-key", "new-value");
        const valueCreate = await map1Create.get("new-key");

        const containerGet = (await tinyliciousClient.getContainer(containerId, schema)).container;
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
        const dynamicSchema: ContainerSchema = {
            initialObjects: {
                map1: SharedMap,
            },
            dynamicObjectTypes: [SharedDirectory],
        };

        const container = (await tinyliciousClient.createContainer(dynamicSchema)).container;
        await container.attach();
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
        const dynamicSchema: ContainerSchema = {
            initialObjects: {
                map1: SharedMap,
            },
            dynamicObjectTypes: [TestDataObject],
        };

        const createFluidContainer = (await tinyliciousClient.createContainer(dynamicSchema)).container;
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
        const obj = await map1.get("newpair-id").get();
        assert.ok(obj, "container added dynamic objects incorrectly");
    });

    /**
     * Scenario: test if FluidContainer emits error events with appropriate error type.
     *
     * Expected behavior: Injecting faulty op should force FluidContainer to close, while emitting
     * error event.
     */
     it("can process data corruption events", async () => {
        const dynamicSchema: ContainerSchema = {
            initialObjects: {
                do1: TestDataObject,
            },
        };

        const createFluidContainer = (await tinyliciousClient.createContainer(dynamicSchema)).container;
        await createFluidContainer.attach();
        await new Promise<void>((resolve, reject) => {
            createFluidContainer.on("connected", () => {
                resolve();
            });
        });

        const do1 = createFluidContainer.initialObjects.do1 as TestDataObject;
        const dataCorruption = allDataCorruption([createFluidContainer]);
        await corruptedAliasOp(runtimeOf(do1), "alias");
        assert(await dataCorruption);
    });
});
