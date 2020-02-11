/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as api from "@fluid-internal/client-api";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import {
    DocumentDeltaEventManager,
    TestDocumentServiceFactory,
    TestResolver,
} from "@microsoft/fluid-local-test-server";
import { ITestDeltaConnectionServer, TestDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { ISharedMap } from "@microsoft/fluid-map";
import {
    ConsensusRegisterCollection,
    IConsensusRegisterCollection,
    ReadPolicy,
} from "@microsoft/fluid-register-collection";
import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";

interface ISharedObjectConstructor<T> {
    create(runtime: IComponentRuntime, id?: string): T;
}

function generate(name: string, ctor: ISharedObjectConstructor<IConsensusRegisterCollection>) {
    describe(name, () => {
        const id = "fluid://test.com/test/test";

        let testDeltaConnectionServer: ITestDeltaConnectionServer;
        let documentDeltaEventManager: DocumentDeltaEventManager;
        let user1Document: api.Document;
        let user2Document: api.Document;
        let user3Document: api.Document;
        let root1: ISharedMap;
        let root2: ISharedMap;
        let root3: ISharedMap;

        beforeEach(async () => {
            testDeltaConnectionServer = TestDeltaConnectionServer.create();
            documentDeltaEventManager = new DocumentDeltaEventManager(testDeltaConnectionServer);
            const documentService = new TestDocumentServiceFactory(testDeltaConnectionServer);
            const resolver = new TestResolver();
            user1Document = await api.load(
                id, resolver, {}, documentService);
            documentDeltaEventManager.registerDocuments(user1Document);

            user2Document = await api.load(
                id, resolver, {}, documentService);
            documentDeltaEventManager.registerDocuments(user2Document);

            user3Document = await api.load(
                id, resolver, {}, documentService);
            documentDeltaEventManager.registerDocuments(user3Document);
            root1 = user1Document.getRoot();
            root2 = user2Document.getRoot();
            root3 = user3Document.getRoot();
        });

        it("Should not work before attach", async () => {
            const collection1 = ctor.create(user1Document.runtime);
            collection1.write("test-key", "test-value").then(() => {
                assert(false, "Writing to local did not fail");
            }).catch((reason) => {
                assert(true, "Writing to local should fail");
            });
        });

        it("Should work after attach", async () => {
            const collection1 = ctor.create(user1Document.runtime);
            root1.set("collection", collection1.handle);
            await collection1.write("key1", "value1");
            await collection1.write("key2", "value2");

            const [collection2Handle, collection3Handle] = await Promise.all([
                root2.wait<IComponentHandle>("collection"),
                root3.wait<IComponentHandle>("collection"),
            ]);
            const collection2 = await collection2Handle.get<IConsensusRegisterCollection>();
            const collection3 = await collection3Handle.get<IConsensusRegisterCollection>();

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
            const collection1 = ctor.create(user1Document.runtime);
            root1.set("collection", collection1.handle);

            const [collection2Handle, collection3Handle] = await Promise.all([
                root2.wait<IComponentHandle>("collection"),
                root3.wait<IComponentHandle>("collection"),
            ]);
            const collection2 = await collection2Handle.get<IConsensusRegisterCollection>();
            const collection3 = await collection3Handle.get<IConsensusRegisterCollection>();

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
            const collection1 = ctor.create(user1Document.runtime);
            root1.set("collection", collection1.handle);

            const [collection2Handle, collection3Handle] = await Promise.all([
                root2.wait<IComponentHandle>("collection"),
                root3.wait<IComponentHandle>("collection"),
            ]);
            const collection2 = await collection2Handle.get<IConsensusRegisterCollection>();
            const collection3 = await collection3Handle.get<IConsensusRegisterCollection>();

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

        afterEach(async () => {
            await Promise.all([
                user1Document.close(),
                user2Document.close(),
                user3Document.close(),
            ]);
            await testDeltaConnectionServer.webSocketServer.close();
        });
    });
}

generate("ConsensusRegisterCollection", ConsensusRegisterCollection);
