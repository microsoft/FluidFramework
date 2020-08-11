/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IDeltaConnection, IChannelServices } from "@fluidframework/datastore-definitions";
import {
    MockContainerRuntimeFactory,
    MockContainerRuntimeFactoryForReconnection,
    MockContainerRuntimeForReconnection,
    MockFluidDataStoreRuntime,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { ConsensusQueueFactory } from "../consensusOrderedCollectionFactory";
import { ConsensusResult, IConsensusOrderedCollection } from "../interfaces";
import { acquireAndComplete, waitAcquireAndComplete } from "../testUtils";

describe("ConsensusOrderedCollection", () => {
    const factory = new ConsensusQueueFactory();

    function generate(
        input: any[],
        output: any[],
        creator: () => IConsensusOrderedCollection,
        processMessages: () => void) {
        let testCollection: IConsensusOrderedCollection;

        async function removeItem() {
            const resP = acquireAndComplete(testCollection);
            processMessages();
            setImmediate(() => processMessages());
            return resP;
        }

        async function waitAndRemoveItem() {
            processMessages();
            const resP = waitAcquireAndComplete(testCollection);
            processMessages();
            setImmediate(() => processMessages());
            return resP;
        }

        async function addItem(item) {
            const waitP = testCollection.add(item);
            processMessages();
            return waitP;
        }

        describe("ConsensusQueue", () => {
            beforeEach(async () => {
                testCollection = creator();
            });

            it("Can create a collection", () => {
                assert.ok(testCollection);
            });

            it("Can add and remove data", async () => {
                assert.strictEqual(await removeItem(), undefined);
                await addItem("testValue");
                assert.strictEqual(await removeItem(), "testValue");
                assert.strictEqual(await removeItem(), undefined);
            });

            it("Can add and remove a handle", async () => {
                assert.strictEqual(await removeItem(), undefined);
                const handle = testCollection.handle;
                assert(handle, "Need an actual handle to test this case");
                await addItem(handle);

                const acquiredValue = await removeItem();
                assert.strictEqual(acquiredValue.absolutePath, handle.absolutePath);
                const dataStore = await handle.get();
                assert.strictEqual(dataStore.url, testCollection.url);

                assert.strictEqual(await removeItem(), undefined);
            });

            it("Can add and release data", async () => {
                await addItem("testValue");
                const promise = testCollection.acquire(async (value) => {
                    assert.strictEqual(value, "testValue");
                    return ConsensusResult.Release;
                });
                processMessages();
                await promise;
                assert.strictEqual(await waitAndRemoveItem(), "testValue");
                assert.strictEqual(await removeItem(), undefined);
            });

            it("Can wait for data", async () => {
                let added = false;
                let res: any;
                const p = testCollection.waitAndAcquire(async (value) => {
                    assert(added, "Wait resolved before value is added");
                    res = value;
                    return ConsensusResult.Complete;
                });

                const p2 = addItem("testValue");
                processMessages();
                added = true;
                await p2;
                // There are two hops here - one "acquire" message, another "release" message.
                processMessages();
                setImmediate(() => processMessages());
                await p;
                assert.strictEqual(res, "testValue");
            });

            it("Data ordering", async () => {
                for (const item of input) {
                    await addItem(item);
                }

                for (const item of output) {
                    assert.strictEqual(await removeItem(), item);
                }
                assert.strictEqual(await removeItem(), undefined,
                    "Remove from empty collection should undefined");
            });

            it("Event", async () => {
                let addCount = 0;
                let removeCount = 0;
                testCollection.on("add", (value) => {
                    assert.strictEqual(value, input[addCount], "Added event value not matched");
                    addCount += 1;
                });
                testCollection.on("acquire", (value) => {
                    assert.strictEqual(value, output[removeCount], "Remove event value not matched");
                    removeCount += 1;
                });
                for (const item of input) {
                    await addItem(item);
                }

                processMessages();

                let count = output.length;
                while (count > 0) {
                    await removeItem();
                    count -= 1;
                }
                assert.strictEqual(await removeItem(), undefined,
                    "Remove from empty collection should undefined");

                assert.strictEqual(addCount, input.length, "Incorrect number add event");
                assert.strictEqual(removeCount, output.length, "Incorrect number remove event");
            });

            it("Object value needs to be cloned", async () => {
                const obj = { x: 1 };
                await addItem(obj);
                const result = await removeItem();
                assert.notStrictEqual(result, obj);
                assert.strictEqual(result.x, 1);
            });
        });
    }

    describe("Detached", () => {
        generate([1, 2], [1, 2], () => {
            return factory.create(new MockFluidDataStoreRuntime(), "consensus-ordered-collection");
        },
            () => { });
    });

    describe("Attached, connected", () => {
        let containerRuntimeFactory: MockContainerRuntimeFactory;
        let counter = 0;

        generate([1, 2], [1, 2],
            () => {
                containerRuntimeFactory = new MockContainerRuntimeFactory();
                const dataStoreRuntime = new MockFluidDataStoreRuntime();
                const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
                const services: IChannelServices = {
                    deltaConnection: containerRuntime.createDeltaConnection(),
                    objectStorage: new MockStorage(),
                };

                counter++;
                const testCollection = factory.create(dataStoreRuntime, `consensus-ordered-collection_${counter}`);
                testCollection.connect(services);
                return testCollection;
            },
            () => {
                containerRuntimeFactory.processAllMessages();
            });
    });

    describe("Reconnection flow", () => {
        let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
        let containerRuntime1: MockContainerRuntimeForReconnection;
        let containerRuntime2: MockContainerRuntimeForReconnection;
        let testCollection1: IConsensusOrderedCollection;
        let testCollection2: IConsensusOrderedCollection;

        async function createConsensusOrderedCollection(
            id: string,
            dataStoreRuntime: MockFluidDataStoreRuntime,
            deltaConnection: IDeltaConnection,
        ): Promise<IConsensusOrderedCollection> {
            const services: IChannelServices = {
                deltaConnection,
                objectStorage: new MockStorage(),
            };

            const consensusOrderedCollection = factory.create(dataStoreRuntime, id);
            consensusOrderedCollection.connect(services);
            return consensusOrderedCollection;
        }

        beforeEach(async () => {
            containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

            // Create first ConsensusOrderedCollection
            const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
            containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
            const deltaConnection1 = containerRuntime1.createDeltaConnection();
            testCollection1 = await createConsensusOrderedCollection(
                "consensus-ordered-collection1",
                dataStoreRuntime1,
                deltaConnection1,
            );

            // Create second ConsensusOrderedCollection
            const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
            containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
            const deltaConnection2 = containerRuntime2.createDeltaConnection();
            testCollection2 = await createConsensusOrderedCollection(
                "consensus-ordered-collection2",
                dataStoreRuntime2,
                deltaConnection2,
            );
        });

        it("can resend unacked ops on reconnection", async () => {
            /**
             * First, we will add a value to the first collection and verify the op is resent.
             */
            const testValue = "testValue";

            // Add a listener to the second collection. This is used to verify that the added value reaches the remote
            // client.
            let addedValue: string = "";
            let newlyAdded: boolean = false;
            testCollection2.on("add", (value: any, added: boolean) => {
                addedValue = value;
                newlyAdded = added;
            });

            // Add a value to the first ConsensusOrderedCollection
            const waitP = testCollection1.add(testValue);

            // Disconnect and reconnect the first collection.
            containerRuntime1.connected = false;
            containerRuntime1.connected = true;

            // Process the messages.
            containerRuntimeFactory.processAllMessages();

            await waitP;

            // Verify that the remote collection received the added value.
            assert.equal(addedValue, testValue, "The remote client did not receive the added value");
            assert.equal(newlyAdded, true, "The remote client's value was not newly added");

            /**
             * Now, we will acquire the added value in the first collection and verify the op is resent.
             */

            // Add a listener to the second collection. This is used to verify that the acquired op reaches the remote
            // client.
            let acquiredValue: string = "";
            let acquiredClientId: string | undefined = "";
            testCollection2.on("acquire", (value: any, clientId?: string) => {
                acquiredValue = value;
                acquiredClientId = clientId;
            });

            // Acquire the previously added value.
            let res: any;
            const resultP = testCollection1.acquire(async (value) => {
                res = value;
                return ConsensusResult.Complete;
            });

            // Disconnect and reconnect the first collection.
            containerRuntime1.connected = false;
            containerRuntime1.connected = true;

            // Process the messages.
            containerRuntimeFactory.processAllMessages();
            setImmediate(() => containerRuntimeFactory.processAllMessages());

            await resultP;

            // Verify that the value acquired is the one that was added earlier.
            assert.equal(res, testValue, "The acquired value does not match the added value");

            // Verify that the remote collection received the acquired op.
            assert.equal(acquiredValue, testValue, "The remote client did not receive the acquired value");
            assert.equal(acquiredClientId, containerRuntime1.clientId,
                "The remote client did not get the correct id of client that acquired the value");
        });

        it("can store ops in disconnected state and resend them on reconnection", async () => {
            const testValue = "testValue";

            // Add a listener to the second collection. This is used to verify that the added value reaches the
            // remote client.
            let addedValue: string = "";
            let newlyAdded: boolean = false;
            testCollection2.on("add", (value: any, added: boolean) => {
                addedValue = value;
                newlyAdded = added;
            });

            // Disconnect the first collection
            containerRuntime1.connected = false;

            // Add a value to the first ConsensusOrderedCollection.
            const waitP = testCollection1.add(testValue);

            // Reconnect the first collection.
            containerRuntime1.connected = true;

            // Process the messages.
            containerRuntimeFactory.processAllMessages();

            await waitP;

            // Verify that the remote collection received the added value.
            assert.equal(addedValue, testValue, "The remote client did not receive the added value");
            assert.equal(newlyAdded, true, "The remote client's value was not newly added");
        });
    });
});
