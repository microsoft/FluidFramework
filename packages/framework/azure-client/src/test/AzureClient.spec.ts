/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
// import { AttachState } from "@fluidframework/container-definitions";
import { ContainerSchema } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { createAzureClient } from "./AzureClientFactory";
// import { TestDataObject } from "./TestDataObject";

describe("AzureClient", () => {
    const client = createAzureClient();
    const schema: ContainerSchema = {
        initialObjects: {
            map1: SharedMap,
        },
    };

    // /**
    //  * Scenario: test when Azure Client is instantiated correctly, it can create
    //  * a container successfully.
    //  *
    //  * Expected behavior: an error should not be thrown nor should a rejected promise
    //  * be returned.
    //  */
    // it("can create new Azure Fluid Relay container successfully", async () => {
    //     const azureContainer = client.createContainer(schema);

    //     await assert.doesNotReject(
    //         azureContainer,
    //         () => true,
    //         "container cannot be created in Azure Fluid Relay",
    //     );
    // });

    // /**
    //  * Scenario: test when an Azure Client container is created,
    //  * it is initially detached.
    //  *
    //  * Expected behavior: an error should not be thrown nor should a rejected promise
    //  * be returned.
    //  */
    // it("Created container is detached", async () => {
    //     const { container } = await client.createContainer(schema);
    //     assert.strictEqual(container.attachState, AttachState.Detached, "Container should be detached");
    // });

    // /**
    //  * Scenario: Test attaching a container.
    //  *
    //  * Expected behavior: an error should not be thrown nor should a rejected promise
    //  * be returned.
    //  */
    // it("can attach a container", async () => {
    //     const { container } = await client.createContainer(schema);
    //     const containerId = await container.attach();

    //     assert.strictEqual(
    //         typeof (containerId), "string",
    //         "Attach did not return a string ID",
    //     );
    //     assert.strictEqual(
    //         container.attachState, AttachState.Attached,
    //         "Container is not attached after attach is called",
    //     );
    // });

    // /**
    //  * Scenario: Test if attaching a container twice fails.
    //  *
    //  * Expected behavior: an error should not be thrown nor should a rejected promise
    //  * be returned.
    //  */
    // it("cannot attach a container twice", async () => {
    //     const { container } = await client.createContainer(schema);
    //     const containerId = await container.attach();

    //     assert.strictEqual(
    //         typeof (containerId), "string",
    //         "Attach did not return a string ID",
    //     );
    //     assert.strictEqual(
    //         container.attachState, AttachState.Attached,
    //         "Container is attached after attach is called",
    //     );
    //     await assert.rejects(
    //         container.attach(),
    //         () => true,
    //         "Container should not attached twice",
    //     );
    // });

    // /**
    //  * Scenario: test if Azure Client can get an existing container.
    //  *
    //  * Expected behavior: an error should not be thrown nor should a rejected promise
    //  * be returned.
    //  */
    // it("can retrieve existing Azure Fluid Relay container successfully", async () => {
    //     const { container: newContainer } = await client.createContainer(schema);
    //     const containerId = await newContainer.attach();

    //     const resources = client.getContainer(containerId, schema);
    //     await assert.doesNotReject(
    //         resources,
    //         () => true,
    //         "container cannot be retrieved from Azure Fluid Relay",
    //     );
    // });

    // /**
    //  * Scenario: test if Azure Client can get a non-exiting container.
    //  *
    //  * Expected behavior: an error should be thrown when trying to get a non-existent container.
    //  */
    // it("cannot load improperly created container (cannot load a non-existent container)", async () => {
    //     const containerAndServicesP = client.getContainer("containerConfig", schema);

    //     const errorFn = (error) => {
    //         assert.notStrictEqual(error.message, undefined, "Azure Client error is undefined");
    //         return true;
    //     };

    //     await assert.rejects(
    //         containerAndServicesP,
    //         errorFn,
    //         "Azure Client can load a non-existent container",
    //     );
    // });

    // /**
    //  * Scenario: test when an Azure Client container is created,
    //  * it can set the initial objects.
    //  *
    //  * Expected behavior: an error should not be thrown nor should a rejected promise
    //  * be returned.
    //  */
    // it("can set initial objects for a container", async () => {
    //     const { container: newContainer } = await client.createContainer(schema);
    //     const containerId = await newContainer.attach();

    //     const resources = client.getContainer(containerId, schema);
    //     await assert.doesNotReject(
    //         resources,
    //         () => true,
    //         "container cannot be retrieved from Azure Fluid Relay",
    //     );

    //     const { container } = await resources;
    //     assert.deepStrictEqual(Object.keys(container.initialObjects), Object.keys(schema.initialObjects));
    // });

    /**
     * Scenario: test if initialObjects passed into the container functions correctly.
     *
     * Expected behavior: initialObjects value loaded in two different containers should mirror
     * each other after value is changed.
     */
    it("can change initialObjects value", async () => {
        const { container } = await client.createContainer(schema);
        const containerId = await container.attach();

        const initialObjectsCreate = container.initialObjects;
        const map1Create = initialObjectsCreate.map1 as SharedMap;
        map1Create.set("new-key", "new-value");
        const valueCreate = await map1Create.get("new-key");
        map1Create.on("error", (err) => {
            console.log("create map error:", err);
        });

        // console.log("AFTER SET 1:", valueCreate);
        await new Promise((res) => setTimeout(res, 75));

        const containerGet = (await client.getContainer(containerId, schema)).container as any;
        // containerGet.on("close", (err) => {
        //     console.log("close err:", err);
        // });
        // containerGet.on("warning", (err) => {
        //     console.log("warning err:", err);
        // });
        // console.log(containerGet.initialObjects);
        const map1Get = containerGet.initialObjects.map1 as SharedMap;
        console.log("KEYS:", map1Get.keys());

        map1Get.on("error", (err) => {
            console.log("get map error:", err);
        });
        const valueGet = await map1Get.get("new-key");
        console.log("VALUE GET:", valueGet, "VALUE CREATE:", valueCreate);

        // map1Get.set("new-key", "new-new-value");
        // console.log("AFTER SET 2:", await map1Get.get("new-key"));
        // console.log("EVENTS:", map1Get.eventNames());
        assert.strictEqual(valueGet, valueCreate, "container can't change initial objects");
    });

    /**
     * Scenario: test if the optional schema parameter, dynamicObjectTypes (DDS),
     * can be added during runtime and be returned by the container.
     *
     * Expected behavior: added loadable object can be retrieved from the container. Loadable
     * object's id and container config ID should be identical since it's now attached to
     * the container.
     */
    // it("can create/add loadable objects (DDS) dynamically during runtime", async () => {
    //             map1: SharedMap,
    //         },
    //         dynamicObjectTypes: [SharedDirectory],
    //     };

    //     const container = (await client.createContainer(dynamicSchema)).container;

    //     const map1 = container.initialObjects.map1 as SharedMap;
    //     const newPair = await container.create(SharedDirectory);

    //  * Expected behavior: added loadable object can be retrieved from the container. Loadable
    //  * object's id and containeronfig ID should be identical since it's now attached to
    //  * the container.
    //  */
    // it("can create/add loadable objects (custom data object) dynamically during runtime", async () => {
    //     const dynamicSchema: ContainerSchema = {
    //         initialObjects: {
    //             map1: SharedMap,
    //         },
    //         dynamicObjectTypes: [TestDataObject],
    //     };

    //     const createFluidContainer = (await client.createContainer(dynamicSchema)).container;

    //     const newPair = await createFluidContainer.create(TestDataObject);
    //     assert.ok(newPair?.handle);

    //     const map1 = createFluidContainer.initialObjects.map1 as SharedMap;
    //     map1.set("newpair-id", newPair.handle);
    //     const obj = await map1.get("newpair-id").get();
    //     assert.ok(obj, "container added dynamic objects incorrectly");
    // });
});
