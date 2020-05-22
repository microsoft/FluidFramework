/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import {
    ConsensusRegisterCollection,
    IConsensusRegisterCollection,
    ReadPolicy,
} from "@fluidframework/register-collection";
import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createLocalLoader,
    ITestFluidComponent,
    initializeLocalContainer,
    TestFluidComponentFactory,
} from "@fluidframework/test-utils";

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

        it("Basic functionality", async () => {
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

        it("Can store handles", async () => {
            // Set up the collection with two handles and add it to the map so other containers can find it
            const collection1 = ctor.create(component1.runtime);
            sharedMap1.set("test", "sampleValue");
            sharedMap1.set("collection", collection1.handle);
            await collection1.write("handleA", sharedMap1.handle);
            await collection1.write("handleB", sharedMap1.handle);

            // Pull the collection off of the 2nd container
            const collection2Handle =
                await sharedMap2.wait<IComponentHandle<IConsensusRegisterCollection>>("collection");
            const collection2 = await collection2Handle.get();

            // acquire one handle in each container
            const sharedMap1HandleB = collection1.read("handleB") as IComponentHandle<ISharedMap>;
            const sharedMap1Prime = await sharedMap1HandleB.get();
            const sharedMap2HandleA = collection2.read("handleA") as IComponentHandle<ISharedMap>;
            const sharedMap2Prime = await sharedMap2HandleA.get();

            assert.equal(sharedMap1Prime.get("test"), "sampleValue");
            assert.equal(sharedMap2Prime.get("test"), "sampleValue");
        });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });
    });
}

generate("ConsensusRegisterCollection", ConsensusRegisterCollection);
