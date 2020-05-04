/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
// import { SinonFakeTimers, useFakeTimers } from "sinon";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
import { Container } from "@microsoft/fluid-container-loader";
import { DocumentDeltaEventManager } from "@microsoft/fluid-local-driver";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import {
    acquireAndComplete,
    ConsensusQueue,
    ConsensusResult,
    ConsensusOrderedCollection,
    ConsensusCallback,
    IConsensusOrderedCollection,
    waitAcquireAndComplete,
} from "@microsoft/fluid-ordered-collection";
import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import {
    createLocalLoader,
    ITestFluidComponent,
    initializeLocalContainer,
    TestFluidComponentFactory,
} from "@microsoft/fluid-test-utils";

interface ISharedObjectConstructor<T> {
    create(runtime: IComponentRuntime, id?: string): T;
}

function generate(
    name: string, ctor: ISharedObjectConstructor<IConsensusOrderedCollection>,
    input: any[], output: any[]) {
    describe(name, () => {
        const id = "fluid-test://localhost/consensusOrderedCollectionTest";
        const mapId = "mapKey";
        const codeDetails: IFluidCodeDetails = {
            package: "consensusOrderedCollectionTestPackage",
            config: {},
        };

        let deltaConnectionServer: ILocalDeltaConnectionServer;
        let containerDeltaEventManager: DocumentDeltaEventManager;
        let component1: ITestFluidComponent;
        let component2: ITestFluidComponent;
        let sharedMap1: ISharedMap;
        let sharedMap2: ISharedMap;
        let sharedMap3: ISharedMap;

        async function getComponent(componentId: string, container: Container): Promise<ITestFluidComponent> {
            const response = await container.request({ url: componentId });
            if (response.status !== 200 || response.mimeType !== "fluid/component") {
                throw new Error(`Component with id: ${componentId} not found`);
            }
            return response.value as ITestFluidComponent;
        }

        async function createContainer(): Promise<Container> {
            const factory = new TestFluidComponentFactory([
                [ mapId, SharedMap.getFactory() ],
                [ undefined, ConsensusQueue.getFactory() ],
            ]);
            const loader = createLocalLoader([[ codeDetails, factory ]], deltaConnectionServer);
            return initializeLocalContainer(id, loader, codeDetails);
        }

        beforeEach(async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();

            const container1 = await createContainer();
            component1 = await getComponent("default", container1);
            sharedMap1 = await component1.getSharedObject<SharedMap>(mapId);

            const container2 = await createContainer();
            component2 = await getComponent("default", container2);
            sharedMap2 = await component2.getSharedObject<SharedMap>(mapId);

            const container3 = await createContainer();
            const component3 = await getComponent("default", container3);
            sharedMap3 = await component3.getSharedObject<SharedMap>(mapId);

            containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
            containerDeltaEventManager.registerDocuments(component1.runtime, component2.runtime);
        });

        it("Should initialize after attach", async () => {
            const collection1 = ctor.create(component1.runtime);
            for (const item of input) {
                await collection1.add(item);
            }
            sharedMap1.set("collection", collection1.handle);

            const [collection2Handle, collection3Handle] = await Promise.all([
                sharedMap2.wait<IComponentHandle<IConsensusOrderedCollection>>("collection"),
                sharedMap3.wait<IComponentHandle<IConsensusOrderedCollection>>("collection"),
            ]);
            const collection2 = await collection2Handle.get();
            const collection3 = await collection3Handle.get();

            assert.strictEqual(
                await acquireAndComplete(collection1),
                output[0],
                "Collection not initialize in document 1");
            assert.strictEqual(
                await acquireAndComplete(collection2),
                output[1],
                "Collection not initialize in document 2");
            assert.strictEqual(
                await acquireAndComplete(collection3),
                output[2],
                "Collection not initialize in document 3");

            assert.strictEqual(
                await acquireAndComplete(collection3),
                undefined,
                "Remove of empty collection should be undefined");
        });

        it("Simultaneous add and remove should be ordered and value return to only one client", async () => {
            const collection1 = ctor.create(component1.runtime);
            sharedMap1.set("collection", collection1.handle);

            const [collection2Handle, collection3Handle] = await Promise.all([
                sharedMap2.wait<IComponentHandle<IConsensusOrderedCollection>>("collection"),
                sharedMap3.wait<IComponentHandle<IConsensusOrderedCollection>>("collection"),
            ]);
            const collection2 = await collection2Handle.get();
            const collection3 = await collection3Handle.get();

            await containerDeltaEventManager.pauseProcessing();

            const addP = [];
            for (const item of input) {
                addP.push(collection1.add(item));
            }
            await containerDeltaEventManager.process();
            await Promise.all(addP);

            const removeP1 = acquireAndComplete(collection3);
            // drain the outgoing so that the next set will come after
            await containerDeltaEventManager.processOutgoing();
            const removeP2 = acquireAndComplete(collection2);
            // drain the outgoing so that the next set will come after
            await containerDeltaEventManager.processOutgoing();
            const removeP3 = acquireAndComplete(collection1);

            const removeEmptyP = acquireAndComplete(collection1);

            // Now process all the incoming and outgoing
            await containerDeltaEventManager.process();

            // Verify the value is in the correct order
            assert.strictEqual(await removeP1, output[0], "Unexpected value in document 1");
            assert.strictEqual(await removeP2, output[1], "Unexpected value in document 2");
            assert.strictEqual(await removeP3, output[2], "Unexpected value in document 3");
            assert.strictEqual(await removeEmptyP, undefined, "Remove of empty collection should be undefined");
        });

        it("Wait resolves", async () => {
            const collection1 = ctor.create(component1.runtime);
            sharedMap1.set("collection", collection1.handle);

            const [collection2Handle, collection3Handle] = await Promise.all([
                sharedMap2.wait<IComponentHandle<IConsensusOrderedCollection>>("collection"),
                sharedMap3.wait<IComponentHandle<IConsensusOrderedCollection>>("collection"),
            ]);
            const collection2 = await collection2Handle.get();
            const collection3 = await collection3Handle.get();

            await containerDeltaEventManager.pauseProcessing();

            const waitOn2P = waitAcquireAndComplete(collection2);
            await containerDeltaEventManager.process();
            let added = false;
            waitOn2P.then(
                (value) => {
                    assert(added, "Wait resolved before value is added");
                    return value;
                })
                .catch((reason) => {
                    assert(false, "Unexpected promise rejection");
                });

            const addP1 = collection1.add(input[0]);
            // drain the outgoing so that the next set will come after
            await containerDeltaEventManager.processOutgoing();
            const addP2 = collection3.add(input[1]);
            // drain the outgoing so that the next set will come after
            await containerDeltaEventManager.processOutgoing();
            const addP3 = collection2.add(input[2]);
            // drain the outgoing so that the next set will come after
            await containerDeltaEventManager.processOutgoing();
            added = true;

            // Now process the incoming
            await containerDeltaEventManager.process();
            await Promise.all([addP1, addP2, addP3]);
            assert.strictEqual(await waitOn2P, output[0],
                "Unexpected wait before add resolved value in document 2 added in document 1");

            const waitOn1P = waitAcquireAndComplete(collection1);
            await containerDeltaEventManager.process();
            assert.strictEqual(await waitOn1P, output[1],
                "Unexpected wait after add resolved value in document 1 added in document 3");

            const waitOn3P = waitAcquireAndComplete(collection3);
            await containerDeltaEventManager.process();
            assert.strictEqual(await waitOn3P, output[2],
                "Unexpected wait after add resolved value in document 13added in document 2");
        });

        it("Can store handles", async () => {
            // Set up the collection with two handles and add it to the map so other containers can find it
            const collection1 = ctor.create(component1.runtime);
            sharedMap1.set("test", "sampleValue");
            sharedMap1.set("collection", collection1.handle);
            await collection1.add(sharedMap1.handle);
            await collection1.add(sharedMap1.handle);

            // Pull the collection off of the 2nd container
            const collection2Handle =
                await sharedMap2.wait<IComponentHandle<IConsensusOrderedCollection>>("collection");
            const collection2 = await collection2Handle.get();

            // acquire one handle in each container
            const sharedMap1Handle = await acquireAndComplete(collection1) as IComponentHandle<ISharedMap>;
            const sharedMap1Prime = await sharedMap1Handle.get();
            const sharedMap2Handle = await acquireAndComplete(collection2) as IComponentHandle<ISharedMap>;
            const sharedMap2Prime = await sharedMap2Handle.get();

            assert.equal(sharedMap1Prime.get("test"), "sampleValue");
            assert.equal(sharedMap2Prime.get("test"), "sampleValue");
        });

        it("Can add and release data", async () => {
            const collection1 = ctor.create(component1.runtime);
            sharedMap1.set("collection", collection1.handle);

            const collection2Handle =
                await sharedMap2.wait<IComponentHandle<IConsensusOrderedCollection>>("collection");
            const collection2 = await collection2Handle.get();

            await collection1.add("testValue");
            const acquireReleaseP = collection1.acquire(async (value) => {
                assert.strictEqual(value, "testValue");
                return ConsensusResult.Release;
            });
            const waitAcquireCompleteP = waitAcquireAndComplete(collection2);

            assert.equal(await acquireReleaseP, true);
            assert.equal(await waitAcquireCompleteP, "testValue");
            assert.equal(await acquireAndComplete(collection1), undefined);
            assert.equal(await acquireAndComplete(collection2), undefined);
        });

        async function myWaitAndAcquire(callback: ConsensusCallback<any>, coc: ConsensusOrderedCollection) {
            do {
                if (coc.Data.size() === 0) {
                    // Wait for new entry before trying to acquire again
                    await new Promise((resolve, reject) => {
                        coc.once("add", resolve);
                        //* todo: figure out the right event that's available or fix the proxy
                        coc.Runtime.deltaManager.on(
                        // (coc.Runtime.deltaManager as any).deltaManager.on(
                            "closed",
                            () => {
                                console.log("REJECT"); reject(new Error("Delta Manager closed while waiting"));
                            });
                    });
                }
            } while (!(await coc.acquire(callback)));
        }

        /**
         * Helper method to acquire and complete an item
         * Should be used in test code only
         */
        async function myWaitAcquireAndComplete<T>(collection: IConsensusOrderedCollection<T>): Promise<T> {
            let res: T | undefined;
            await myWaitAndAcquire(
                async (value: T) => {
                    res = value;
                    return ConsensusResult.Complete;
                },
                collection as ConsensusOrderedCollection<T>,
            );
            return res;
        }

        it("blah", async () => {
            const collection1 = ctor.create(component1.runtime);
            await myWaitAcquireAndComplete(collection1);
        });

        it.only("cancel wait on close", async () => {
            // const clock: SinonFakeTimers = useFakeTimers();

            const collection1 = ctor.create(component1.runtime);
            sharedMap1.set("collection", collection1.handle);

            const collection2Handle =
                await sharedMap2.wait<IComponentHandle<IConsensusOrderedCollection>>("collection");
            const collection2 = await collection2Handle.get();

            let rejected = false;
            myWaitAcquireAndComplete(collection2)
                .catch(() => { rejected = true; });
            component2.runtime.deltaManager.close();
            //* todo: this fails badly too:
            // component1.runtime.deltaManager.close();

            await collection1.add("testValue");

            assert(rejected, "Closing the runtime while waiting should cause promise reject");
            //* todo: This deadlocks, since it's waiting for the op to come back...
            // assert.equal(await acquireAndComplete(collection2), undefined);
            assert.equal(await acquireAndComplete(collection1), "testValue", "testValue should still be there");

            // clock.restore();
        });

        it("Events", async () => {
            const collection1 = ctor.create(component1.runtime);
            sharedMap1.set("collection", collection1.handle);
            const [collection2Handle, collection3Handle] = await Promise.all([
                sharedMap2.wait<IComponentHandle<IConsensusOrderedCollection>>("collection"),
                sharedMap3.wait<IComponentHandle<IConsensusOrderedCollection>>("collection"),
            ]);
            const collection2 = await collection2Handle.get();
            const collection3 = await collection3Handle.get();
            await containerDeltaEventManager.pauseProcessing();

            let addCount1 = 0;
            let addCount2 = 0;
            let addCount3 = 0;

            let removeCount1 = 0;
            let removeCount2 = 0;
            let removeCount3 = 0;
            collection1.on("add", (value) => {
                assert.strictEqual(value, input[addCount1], "Added value not match in document 1");
                addCount1 += 1;
            });
            collection2.on("add", (value) => {
                assert.strictEqual(value, input[addCount2], "Added value not match in document 2");
                addCount2 += 1;
            });
            collection3.on("add", (value) => {
                assert.strictEqual(value, input[addCount3], "Added value not match in document 3");
                addCount3 += 1;
            });

            collection1.on("acquire", (value) => {
                assert.strictEqual(value, output[removeCount1], "Removed value not match in document 1");
                removeCount1 += 1;
            });
            collection2.on("acquire", (value) => {
                assert.strictEqual(value, output[removeCount2], "Removed value not match in document 2");
                removeCount2 += 1;
            });
            collection3.on("acquire", (value) => {
                assert.strictEqual(value, output[removeCount3], "Removed value not match in document 3");
                removeCount3 += 1;
            });

            const p = [];
            p.push(collection1.add(input[0]));
            // drain the outgoing so that the next set will come after
            await containerDeltaEventManager.processOutgoing();
            p.push(collection2.add(input[1]));
            // drain the outgoing so that the next set will come after
            await containerDeltaEventManager.processOutgoing();
            p.push(collection3.add(input[2]));
            // drain the outgoing so that the next set will come after
            await containerDeltaEventManager.processOutgoing();
            p.push(acquireAndComplete(collection2));
            // drain the outgoing so that the next set will come after
            await containerDeltaEventManager.processOutgoing();
            p.push(acquireAndComplete(collection3));
            // drain the outgoing so that the next set will come after
            await containerDeltaEventManager.processOutgoing();
            p.push(acquireAndComplete(collection1));
            // drain the outgoing so that the next set will come after
            await containerDeltaEventManager.processOutgoing();
            const removeEmptyP = acquireAndComplete(collection1);

            // Now process all
            await containerDeltaEventManager.process();
            await Promise.all(p);
            assert.strictEqual(await removeEmptyP, undefined, "Remove of empty collection should be undefined");
            assert.strictEqual(addCount1, 3, "Incorrect number add events in document 1");
            assert.strictEqual(addCount2, 3, "Incorrect number add events in document 2");
            assert.strictEqual(addCount3, 3, "Incorrect number add events in document 3");
            assert.strictEqual(removeCount1, 3, "Incorrect number remove events in document 1");
            assert.strictEqual(removeCount2, 3, "Incorrect number remove events in document 2");
            assert.strictEqual(removeCount3, 3, "Incorrect number remove events in document 3");
        });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });
    });
}

generate("ConsensusQueue", ConsensusQueue, [1, 2, 3], [1, 2, 3]);
