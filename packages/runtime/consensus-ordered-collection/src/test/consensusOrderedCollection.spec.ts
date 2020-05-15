/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { strongAssert } from "@microsoft/fluid-runtime-utils";
import { MockDeltaConnectionFactory, MockRuntime, MockStorage } from "@microsoft/fluid-test-runtime-utils";
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
                strongAssert(handle, "Need an actual handle to test this case");
                await addItem(handle);

                const acquiredValue = await removeItem();
                assert.strictEqual(acquiredValue.path, handle.path);
                const component = await handle.get();
                assert.strictEqual(component.url, testCollection.url);

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
                const p = testCollection.waitAndAcquire(async (value) =>{
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
            return factory.create(new MockRuntime(), "consensus-ordered-collection");
        },
        () => {});
    });

    describe("Attached, connected", () => {
        let deltaConnFactory: MockDeltaConnectionFactory;
        let counter = 0;

        generate([1, 2], [1, 2],
            () => {
                const runtime = new MockRuntime();
                deltaConnFactory = new MockDeltaConnectionFactory();
                const deltaConnection = deltaConnFactory.createDeltaConnection(runtime);
                runtime.services = {
                    deltaConnection,
                    objectStorage: new MockStorage(),
                };
                counter++;
                const testCollection = factory.create(runtime, `consensus-ordered-collection_${counter}`);
                testCollection.connect(runtime.services);
                deltaConnection.connected = true;
                return testCollection;
            },
            () => {
                deltaConnFactory.processAllMessages();
            });
    });

    it("Disconnection flow", async () => {
        const runtime = new MockRuntime();
        const deltaConnFactory = new MockDeltaConnectionFactory();
        const deltaConnection = deltaConnFactory.createDeltaConnection(runtime);
        runtime.services = {
            deltaConnection,
            objectStorage: new MockStorage(),
        };
        const testCollection = factory.create(runtime, "consensus-ordered-collection");
        testCollection.connect(runtime.services);
        deltaConnection.connected = true;

        const waitP = testCollection.add("sample");

        // Drop connection
        deltaConnection.connected = false;
        deltaConnFactory.clearMessages();
        deltaConnection.connected = true;
        deltaConnFactory.processAllMessages();

        await waitP;

        let res: any;
        const resultP = testCollection.acquire(async (value) => {
            res = value;
            return ConsensusResult.Complete;
        });

        // Drop connection one more time
        deltaConnection.connected = false;
        deltaConnFactory.clearMessages();
        deltaConnection.connected = true;
        deltaConnFactory.processAllMessages();
        setImmediate(() => deltaConnFactory.processAllMessages());

        await resultP;
        assert.equal(res, "sample");
    });
});
