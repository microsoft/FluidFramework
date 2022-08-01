/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";
import { AttachState } from "@fluidframework/container-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ContainerSchema } from "@fluidframework/fluid-static";
import { ISharedMap, IValueChanged, SharedMap } from "@fluidframework/map";
import { timeoutPromise } from "@fluidframework/test-utils";
import { AzureClient } from "../AzureClient";
import { AzureMember, IAzureAudience } from "../interfaces";
import { createAzureClient } from "./AzureClientFactory";
import { TestDataObject, CounterTestDataObject } from "./TestDataObject";

const mapWait = async <T>(map: ISharedMap, key: string): Promise<T> => {
    const maybeValue = map.get<T>(key);
    if (maybeValue !== undefined) {
        return maybeValue;
    }

    return new Promise((resolve) => {
        const handler = (changed: IValueChanged): void => {
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

const waitForMyself = async (audience: IAzureAudience): Promise<AzureMember> => {
    return new Promise((resolve) => {
        const handler = (): void => {
            const value = audience.getMyself();
            if (value) {
                resolve(value);
            }
        };
        audience.on("memberAdded", handler);
    });
};

describe("AzureClient", () => {
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

    describe("Fluid container creation", () => {
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
            // eslint-disable-next-line require-atomic-updates
            console.error = consoleErrorFn;
        });
    });

    describe("Fluid data updates", () => {
        /**
         * Scenario: test when an Azure Client container is created,
         * it can set the initial objects.
         *
         * Expected behavior: an error should not be thrown nor should a rejected promise
         * be returned.
         */
        it("can set DDSes as initial objects for a container", async () => {
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

            const { container } = await resources;
            assert.deepStrictEqual(
                Object.keys(container.initialObjects),
                Object.keys(schema.initialObjects),
            );
        });

        /**
         * Scenario: test if initialObjects passed into the container functions correctly.
         *
         * Expected behavior: initialObjects value loaded in two different containers should mirror
         * each other after value is changed.
         */
        it("can change DDSes within initialObjects value", async () => {
            const { container } = await client.createContainer(schema);
            const containerId = await container.attach();

            await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
                durationMs: connectTimeoutMs,
                errorMsg: "container connect() timeout",
            });

            const initialObjectsCreate = container.initialObjects;
            const map1Create = initialObjectsCreate.map1 as SharedMap;
            map1Create.set("new-key", "new-value");
            const valueCreate: string | undefined = map1Create.get("new-key");

            const { container: containerGet } = await client.getContainer(containerId, schema);
            const map1Get = containerGet.initialObjects.map1 as SharedMap;
            const valueGet: string | undefined = await mapWait(map1Get, "new-key");
            assert.strictEqual(valueGet, valueCreate, "container can't change initial objects");
        });

        /**
         * Scenario: test if we can create DataObjects through initialObjects schema.
         *
         * Expected behavior: DataObjects can be retrieved from the original and loaded container.
         */
        it("can set DataObjects as initial objects for a container", async () => {
            const doSchema: ContainerSchema = {
                initialObjects: {
                    mdo1: TestDataObject,
                    mdo2: CounterTestDataObject,
                },
            };
            const { container } = await client.createContainer(doSchema);
            const containerId = await container.attach();

            await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
                durationMs: connectTimeoutMs,
                errorMsg: "container connect() timeout",
            });

            const initialObjectsCreate = container.initialObjects;
            assert(
                initialObjectsCreate.mdo1 instanceof TestDataObject,
                "container returns the wrong type for mdo1",
            );
            assert(
                initialObjectsCreate.mdo2 instanceof CounterTestDataObject,
                "container returns the wrong type for mdo2",
            );

            const { container: containerGet } = await client.getContainer(containerId, doSchema);
            const initialObjectsGet = containerGet.initialObjects;
            assert(
                initialObjectsGet.mdo1 instanceof TestDataObject,
                "container returns the wrong type for mdo1",
            );
            assert(
                initialObjectsCreate.mdo2 instanceof CounterTestDataObject,
                "container returns the wrong type for mdo2",
            );
        });

        /**
         * Scenario: test if we can create multiple DataObjects of the same type
         *
         * Expected behavior: DataObjects of the same type can be retrieved from the
         * original and loaded container.
         * TODO: Known bug that needs to be re-tested once fixed.
         */
        it.skip("can use multiple DataObjects of the same type", async () => {
            const doSchema: ContainerSchema = {
                initialObjects: {
                    mdo1: TestDataObject,
                    mdo2: CounterTestDataObject,
                    mdo3: CounterTestDataObject,
                },
            };
            const { container } = await client.createContainer(doSchema);
            const containerId = await container.attach();

            await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
                durationMs: connectTimeoutMs,
                errorMsg: "container connect() timeout",
            });

            const initialObjectsCreate = container.initialObjects;
            assert(
                initialObjectsCreate.mdo1 instanceof TestDataObject,
                "container returns the wrong type for mdo1",
            );
            assert(
                initialObjectsCreate.mdo2 instanceof CounterTestDataObject,
                "container returns the wrong type for mdo2",
            );
            assert(
                initialObjectsCreate.mdo3 instanceof CounterTestDataObject,
                "container returns the wrong type for mdo3",
            );

            const { container: containerGet } = await client.getContainer(containerId, doSchema);
            const initialObjectsGet = containerGet.initialObjects;
            assert(
                initialObjectsGet.mdo1 instanceof TestDataObject,
                "container returns the wrong type for mdo1",
            );
            assert(
                initialObjectsCreate.mdo2 instanceof CounterTestDataObject,
                "container returns the wrong type for mdo2",
            );
            assert(
                initialObjectsCreate.mdo3 instanceof CounterTestDataObject,
                "container returns the wrong type for mdo3",
            );
        });

        /**
         * Scenario: test if we can change DataObject value contained within initialObjects
         *
         * Expected behavior: DataObject changes are correctly reflected on original and loaded containers
         */
        it("can change DataObjects within initialObjects value", async () => {
            const doSchema: ContainerSchema = {
                initialObjects: {
                    mdo1: TestDataObject,
                    mdo2: CounterTestDataObject,
                },
            };
            const { container } = await client.createContainer(doSchema);
            const initialObjectsCreate = container.initialObjects;
            const mdo2 = initialObjectsCreate.mdo2 as CounterTestDataObject;
            mdo2.increment();
            mdo2.increment();
            mdo2.increment();

            assert.strictEqual(mdo2.value, 3);

            const containerId = await container.attach();

            await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
                durationMs: connectTimeoutMs,
                errorMsg: "container connect() timeout",
            });

            const { container: containerGet } = await client.getContainer(containerId, doSchema);
            const initialObjectsGet = containerGet.initialObjects;
            const mdo2get = initialObjectsGet.mdo2 as CounterTestDataObject;

            assert.strictEqual(mdo2get.value, 3);

            mdo2get.increment();
            mdo2get.increment();
            assert.strictEqual(mdo2get.value, 5);
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

            const { container } = await client.createContainer(dynamicSchema);

            const newDo = await container.create(TestDataObject);
            assert.ok(newDo?.handle);

            const map1 = container.initialObjects.map1 as SharedMap;
            map1.set("new-pair-id", newDo.handle);
            const handle: IFluidHandle | undefined = await map1.get("new-pair-id");
            const obj: unknown = await handle?.get();
            assert.ok(obj, "container added dynamic objects incorrectly");
        });
    });

    describe("Fluid container copy", () => {
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

            assert.strictEqual(
                typeof newContainerId,
                "string",
                "Attach did not return a string ID",
            );
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

            assert.strictEqual(
                typeof newContainerId,
                "string",
                "Attach did not return a string ID",
            );
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

    describe("Fluid audience", () => {
        /**
         * Scenario: Find original member/self
         *
         * Expected behavior: container should have a single member upon creation.
         */
        it("can find original member", async () => {
            const { container, services } = await client.createContainer(schema);
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

            /* This is a workaround for a known bug, we should have one member (self) upon container connection */
            const myself = await waitForMyself(services.audience);
            assert.notStrictEqual(myself, undefined, "We should have myself at this point.");

            const members = services.audience.getMembers();
            assert.strictEqual(members.size, 1, "We should have only one member at this point.");
        });

        /**
         * Scenario: Find partner member
         *
         * Expected behavior: upon resolving container, the partner member should be able
         * to resolve original member.
         */
        it("can find partner member", async () => {
            const { container, services } = await client.createContainer(schema);
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

            /* This is a workaround for a known bug, we should have one member (self) upon container connection */
            const originalSelf = await waitForMyself(services.audience);
            assert.notStrictEqual(originalSelf, undefined, "We should have myself at this point.");

            const client2 = createAzureClient("test-id-2", "test-user-name-2");
            const { services: servicesGet } = await client2.getContainer(containerId, schema);

            const members = servicesGet.audience.getMembers();
            assert.strictEqual(members.size, 2, "We should have two members at this point.");

            const partner = servicesGet.audience.getMyself();
            assert.notStrictEqual(partner, undefined, "We should have other-self at this point.");

            assert.notStrictEqual(
                partner?.userId,
                originalSelf?.userId,
                "Self and partner should have different IDs",
            );
        });

        /**
         * Scenario: Partner should be able to observe change in audience
         *
         * Expected behavior: upon 1 partner leaving, other parther should observe
         * memberRemoved event and have correct partner count.
         */
        it("can observe member leaving", async () => {
            const { container } = await client.createContainer(schema);
            const containerId = await container.attach();

            await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
                durationMs: connectTimeoutMs,
                errorMsg: "container connect() timeout",
            });

            const client2 = createAzureClient("test-id-2", "test-user-name-2");
            const { services: servicesGet } = await client2.getContainer(containerId, schema);

            let members = servicesGet.audience.getMembers();
            assert.strictEqual(members.size, 2, "We should have two members at this point.");

            container.disconnect();

            await new Promise<void>((resolve) => {
                servicesGet.audience.on("memberRemoved", () => {
                    resolve();
                });
            });

            members = servicesGet.audience.getMembers();
            assert.strictEqual(members.size, 1, "We should have one member left at this point.");
        });
    });
});
