/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
import { Container } from "@microsoft/fluid-container-loader";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import {
    ConsensusRegisterCollection,
    IConsensusRegisterCollection,
    ReadPolicy,
} from "@microsoft/fluid-register-collection";
import { IComponentRuntime, IContainerRuntime } from "@microsoft/fluid-runtime-definitions";
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

function generate(name: string, ctor: ISharedObjectConstructor<IConsensusRegisterCollection>) {
    describe(name, () => {
        const id = "fluid-test://localhost/consensusRegisterCollectionTest";
        const mapId = "mapKey";
        const codeDetails: IFluidCodeDetails = {
            package: "consensusRegisterCollectionTestPackage",
            config: {},
        };

        let deltaConnectionServer: ILocalDeltaConnectionServer;
        let component1: ITestFluidComponent;
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
                [ undefined, ConsensusRegisterCollection.getFactory() ],
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
            const component2 = await getComponent("default", container2);
            sharedMap2 = await component2.getSharedObject<SharedMap>(mapId);

            const container3 = await createContainer();
            const component3 = await getComponent("default", container3);
            sharedMap3 = await component3.getSharedObject<SharedMap>(mapId);
        });

        it("Should not work before attach", async () => {
            const collection1 = ctor.create(component1.runtime);
            collection1.write("test-key", "test-value").then(() => {
                assert(false, "Writing to local did not fail");
            }).catch((reason) => {
                assert(true, "Writing to local should fail");
            });
        });

        it("Should work after attach", async () => {
            const collection1 = ctor.create(component1.runtime);
            sharedMap1.set("collection", collection1.handle);
            await collection1.write("key1", "value1");
            await collection1.write("key2", "value2");

            const [collection2Handle, collection3Handle] = await Promise.all([
                sharedMap2.wait<IComponentHandle<IConsensusRegisterCollection>>("collection"),
                sharedMap3.wait<IComponentHandle<IConsensusRegisterCollection>>("collection"),
            ]);
            const collection2 = await collection2Handle.get();
            const collection3 = await collection3Handle.get();

            assert.strictEqual(collection1.read("key1"), "value1", "Collection not initialize in document 1");
            assert.strictEqual(collection2.read("key1"), "value1", "Collection not initialize in document 2");
            assert.strictEqual(collection3.read("key1"), "value1", "Collection not initialize in document 3");
            assert.strictEqual(collection1.read("key2"), "value2", "Collection not initialize in document 1");
            assert.strictEqual(collection2.read("key2"), "value2", "Collection not initialize in document 2");
            assert.strictEqual(collection3.read("key2"), "value2", "Collection not initialize in document 3");

            assert.strictEqual(collection1.read("key3"), undefined, "Reading non existent key should be undefined");
            assert.strictEqual(collection2.read("key3"), undefined, "Reading non existent key should be undefined");
            assert.strictEqual(collection3.read("key3"), undefined, "Reading non existent key should be undefined");
        });

        it("Should store all concurrent writings on a key in sequenced order", async () => {
            const collection1 = ctor.create(component1.runtime);
            sharedMap1.set("collection", collection1.handle);

            const [collection2Handle, collection3Handle] = await Promise.all([
                sharedMap2.wait<IComponentHandle<IConsensusRegisterCollection>>("collection"),
                sharedMap3.wait<IComponentHandle<IConsensusRegisterCollection>>("collection"),
            ]);
            const collection2 = await collection2Handle.get();
            const collection3 = await collection3Handle.get();

            const write1P = collection1.write("key1", "value1");
            const write2P = collection2.write("key1", "value2");
            const write3P = collection3.write("key1", "value3");
            await Promise.all([write1P, write2P, write3P]);
            const versions = collection1.readVersions("key1");
            assert.strictEqual(versions.length, 3, "Concurrent updates were not preserved");
            assert.strictEqual(versions[0], "value1", "Incorrect update sequence");
            assert.strictEqual(versions[1], "value2", "Incorrect update sequence");
            assert.strictEqual(versions[2], "value3", "Incorrect update sequence");

            assert.strictEqual(collection1.read("key1"), "value1", "Default read policy is atomic");
            assert.strictEqual(collection1.read("key1", ReadPolicy.Atomic), "value1", "Atomic policy should work");
            assert.strictEqual(collection1.read("key1", ReadPolicy.LWW), "value3", "LWW policy should work");
        });

        it("Happened after updates should overwrite previous versions", async () => {
            const collection1 = ctor.create(component1.runtime);
            sharedMap1.set("collection", collection1.handle);

            const [collection2Handle, collection3Handle] = await Promise.all([
                sharedMap2.wait<IComponentHandle<IConsensusRegisterCollection>>("collection"),
                sharedMap3.wait<IComponentHandle<IConsensusRegisterCollection>>("collection"),
            ]);
            const collection2 = await collection2Handle.get();
            const collection3 = await collection3Handle.get();

            const write1P = collection1.write("key1", "value1");
            const write2P = collection2.write("key1", "value2");
            const write3P = collection3.write("key1", "value3");
            await Promise.all([write1P, write2P, write3P]);
            const versions = collection1.readVersions("key1");
            assert.strictEqual(versions.length, 3, "Concurrent updates were not preserved");

            await collection3.write("key1", "value4");
            const versions2 = collection1.readVersions("key1");
            assert.strictEqual(versions2.length, 1, "Happened after value did not overwrite");
            assert.strictEqual(versions2[0], "value4", "Happened after value did not overwrite");

            await collection2.write("key1", "value5");
            const versions3 = collection1.readVersions("key1");
            assert.strictEqual(versions3.length, 1, "Happened after value did not overwrite");
            assert.strictEqual(versions3[0], "value5", "Happened after value did not overwrite");

            await collection1.write("key1", "value6");
            const versions4 = collection1.readVersions("key1");
            assert.strictEqual(versions4.length, 1, "Happened after value did not overwrite");
            assert.strictEqual(versions4[0], "value6", "Happened after value did not overwrite");

            const write7P = collection1.write("key1", "value7");
            const write8P = collection2.write("key1", "value8");
            const write9P = collection3.write("key1", "value9");
            await Promise.all([write7P, write8P, write9P]);
            const versions5 = collection3.readVersions("key1");
            assert.strictEqual(versions5.length, 3, "Concurrent happened after updates should overwrite and preserve");
            assert.strictEqual(versions5[0], "value7", "Incorrect update sequence");
            assert.strictEqual(versions5[1], "value8", "Incorrect update sequence");
            assert.strictEqual(versions5[2], "value9", "Incorrect update sequence");

            await collection2.write("key1", "value10");
            const versions6 = collection2.readVersions("key1");
            assert.strictEqual(versions6.length, 1, "Happened after value did not overwrite");
            assert.strictEqual(versions6[0], "value10", "Happened after value did not overwrite");
        });

        /**
         * Creates named DDS or Component
         * Resolves conflicts by concurrently created multiple items and resolving conflict
         * via "first wins" merge conflict resolution policy.
         * Requires active r/w connection (blocks and waits in offline until connected)
         *
         * Pre-conditions:
         *   Writes & Reads should be done to live (attached) content.
         *   Operating on detached DDSs / Components will not work!
         * Side-effects:
         *   If operation is interrupted (container closed, network error), and destination
         *   is un-rooted (and GC'd in future), a reference in CRC can be leaked forever.
         *
         * State transitions:
         *      <CRC>,           <MAP Local>,   <MAP File>
         *      ------------------------------------------
         *  #1: undefined,       undefined,     undefined
         *  #2: value,           undefined,     undefined
         *  #3: value,           value,         undefined
         *  #4: undefined,       value,         value
         *
         *  Args:
         * @param runtime - IContainerRuntime
         * @param crc -  global CRC object to use. Should be removed - need tp get CRC from runtime.
         * @param path - path uniquely identifying an object. If it's "global" / "singleton" object, then it can be
         *               a name / stable ID of that object. If this API is used to create objects in some random
         *               component, path should include path (URI) of that component in container plus path to a
         *               storage within this component. For example, if we are created a component on a marker in
         *               Sequence that is part of Scriptor component, then path takes form of
         *               <URI of Scriptor component>/<ID of Sequence DDS>/<Unique marker ID within Sequence>
         *               The most important property here is that all clients should agree on a path - it should be
         *               the same when referring to same component, and different when creating different instances
         *               of components.
         * @param create - callback that create component
         * @param write - callback that writes handle to created component to its final destination (defined by a path)
         * @param read - tests whether final destination has received component handle.
         */
        async function createNamedItem(
            runtime: IContainerRuntime,
            crc: IConsensusRegisterCollection,
            path: string,
            create: () => IComponentHandle,
            write: (handle: IComponentHandle) => void,
            read: () => IComponentHandle,
        ) {
            // Test for state #4
            let value = read();
            if (value !== undefined) {
                return value;
            }

            // Test for state #1
            value = crc.read(path);
            if (value === undefined) {
                // Transition to state #2
                // Note that we can transition to #2 due to other client bitting us,
                // but it's same state we get to.
                value = create();
                assert(value !== undefined);
                // this waits until write round-trips
                // This client may win or lose that battle!
                await crc.write(path, value);
            }

            // We can be already in state #4!
            // Have to check first final destination - it's possible CRC has been already cleared!
            value = read();
            if (value !== undefined) {
                return value;
            }

            // Ok, it's state #2 or #3.
            // #3 can be either another client transitioning system to #3, or
            // it can be this same client calling this function multiple times in parallel.
            // CRC has to have a value, as it has not yet propagated to final destination
            value = crc.read(path);
            assert(value);

            // Now "move" it to final destination.
            // We rely on batching to transition ownership in one atomic step!
            let p1: Promise<boolean>;
            runtime.orderSequentially(() => {
                write(value);
                p1 = crc.write(path, undefined);
            });

            // It's important that local value in CRC continues to reflect state before "move"
            // I.e. if we were to repeat these steps, we can't overwrite it with new value!
            // This check likely does not work properly for detached container (logic needs to be adjusted for that)
            // It will catch detached CRC, which should not happen as logic would be broken!
            assert(crc.read(path) === value);

            // In practical terms, we can skip / not wait for this step. For all purposes,
            // the value is already in the system. It will either stay on CRC (if OPs above are lost),
            // or move to destination. So we may skip waiting here, but that makes error handling harder.
            await p1;

            // This condition should be true from now on...
            assert(read() === value);
            assert(value !== undefined);
            return value;
        }

        it("CRC", async () => {
            // That should be global CRC retrieved from TaskManager
            const collection1 = ctor.create(component1.runtime);

            const key = "collection";

            const value = await createNamedItem(
                undefined, // TODO: we need to get to IContainerRuntime somehow.
                collection1,
                `${collection1.id}/${mapId}/${key}`,
                () => SharedMap.create(component1.runtime).handle,
                (handle) => { sharedMap1.set(key, handle); },
                () => sharedMap1.get(key),
            );

            assert(sharedMap1.get(key) === value);
        });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });
    });
}

generate("ConsensusRegisterCollection", ConsensusRegisterCollection);
