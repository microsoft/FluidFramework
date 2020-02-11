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
import { ConsensusQueue, ConsensusStack, IConsensusOrderedCollection } from "@microsoft/fluid-ordered-collection";
import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";

interface ISharedObjectConstructor<T> {
    create(runtime: IComponentRuntime, id?: string): T;
}

function generate(
    name: string, ctor: ISharedObjectConstructor<IConsensusOrderedCollection>,
    input: any[], output: any[]) {

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

        it("Should initialize after attach", async () => {
            const collection1 = ctor.create(user1Document.runtime);
            for (const item of input) {
                await collection1.add(item);
            }
            root1.set("collection", collection1.handle);

            const [collection2Handle, collection3Handle] = await Promise.all([
                root2.wait<IComponentHandle>("collection"),
                root3.wait<IComponentHandle>("collection"),
            ]);
            const collection2 = await collection2Handle.get<IConsensusOrderedCollection>();
            const collection3 = await collection3Handle.get<IConsensusOrderedCollection>();

            assert.strictEqual(await collection1.remove(), output[0], "Collection not initialize in document 1");
            assert.strictEqual(await collection2.remove(), output[1], "Collection not initialize in document 2");
            assert.strictEqual(await collection3.remove(), output[2], "Collection not initialize in document 3");

            assert.strictEqual(await collection3.remove(), undefined, "Remove of empty collection should be undefined");
        });

        it("Simultaneous add and remove should be ordered and value return to only one client", async () => {
            const collection1 = ctor.create(user1Document.runtime);
            root1.set("collection", collection1.handle);

            const [collection2Handle, collection3Handle] = await Promise.all([
                root2.wait<IComponentHandle>("collection"),
                root3.wait<IComponentHandle>("collection"),
            ]);
            const collection2 = await collection2Handle.get<IConsensusOrderedCollection>();
            const collection3 = await collection3Handle.get<IConsensusOrderedCollection>();

            await documentDeltaEventManager.pauseProcessing();

            const addP = [];
            for (const item of input) {
                addP.push(collection1.add(item));
            }
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
            await Promise.all(addP);

            const removeP1 = collection3.remove();
            // drain the outgoing so that the next set will come after
            await documentDeltaEventManager.processOutgoing(user1Document, user2Document, user3Document);
            const removeP2 = collection2.remove();
            // drain the outgoing so that the next set will come after
            await documentDeltaEventManager.processOutgoing(user1Document, user2Document, user3Document);
            const removeP3 = collection1.remove();

            const removeEmptyP = collection1.remove();

            // Now process all the incoming and outgoing
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

            // Verify the value is in the correct order
            assert.strictEqual(await removeP1, output[0], "Unexpected value in document 1");
            assert.strictEqual(await removeP2, output[1], "Unexpected value in document 2");
            assert.strictEqual(await removeP3, output[2], "Unexpected value in document 3");
            assert.strictEqual(await removeEmptyP, undefined, "Remove of empty collection should be undefined");
        });

        it("Wait resolves", async () => {
            const collection1 = ctor.create(user1Document.runtime);
            root1.set("collection", collection1.handle);

            const [collection2Handle, collection3Handle] = await Promise.all([
                root2.wait<IComponentHandle>("collection"),
                root3.wait<IComponentHandle>("collection"),
            ]);
            const collection2 = await collection2Handle.get<IConsensusOrderedCollection>();
            const collection3 = await collection3Handle.get<IConsensusOrderedCollection>();

            await documentDeltaEventManager.pauseProcessing();

            const waitOn2P = collection2.waitAndRemove();
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
            let added = false;
            waitOn2P.then(
                (value) => {
                    assert(added, "Wait resolved before value is added");
                })
                .catch((reason) => {
                    assert(false, "Unexpected promise rejection");
                });

            const addP1 = collection1.add(input[0]);
            // drain the outgoing so that the next set will come after
            await documentDeltaEventManager.processOutgoing(user1Document, user2Document, user3Document);
            const addP2 = collection3.add(input[1]);
            // drain the outgoing so that the next set will come after
            await documentDeltaEventManager.processOutgoing(user1Document, user2Document, user3Document);
            const addP3 = collection2.add(input[2]);
            // drain the outgoing so that the next set will come after
            await documentDeltaEventManager.processOutgoing(user1Document, user2Document, user3Document);
            added = true;

            // Now process the incoming
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
            await Promise.all([addP1, addP2, addP3]);
            assert.strictEqual(await waitOn2P, output[0],
                "Unexpected wait before add resolved value in document 2 added in document 1");

            const waitOn1P = collection1.waitAndRemove();
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
            assert.strictEqual(await waitOn1P, output[1],
                "Unexpected wait after add resolved value in document 1 added in document 3");

            const waitOn3P = collection3.waitAndRemove();
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
            assert.strictEqual(await waitOn3P, output[2],
                "Unexpected wait after add resolved value in document 13added in document 2");
        });

        it("Events", async () => {
            const collection1 = ctor.create(user1Document.runtime);
            root1.set("collection", collection1.handle);
            const [collection2Handle, collection3Handle] = await Promise.all([
                root2.wait<IComponentHandle>("collection"),
                root3.wait<IComponentHandle>("collection"),
            ]);
            const collection2 = await collection2Handle.get<IConsensusOrderedCollection>();
            const collection3 = await collection3Handle.get<IConsensusOrderedCollection>();
            await documentDeltaEventManager.pauseProcessing();

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

            collection1.on("remove", (value) => {
                assert.strictEqual(value, output[removeCount1], "Removed value not match in document 1");
                removeCount1 += 1;
            });
            collection2.on("remove", (value) => {
                assert.strictEqual(value, output[removeCount2], "Removed value not match in document 2");
                removeCount2 += 1;
            });
            collection3.on("remove", (value) => {
                assert.strictEqual(value, output[removeCount3], "Removed value not match in document 3");
                removeCount3 += 1;
            });

            const p = [];
            p.push(collection1.add(input[0]));
            // drain the outgoing so that the next set will come after
            await documentDeltaEventManager.processOutgoing(user1Document, user2Document, user3Document);
            p.push(collection2.add(input[1]));
            // drain the outgoing so that the next set will come after
            await documentDeltaEventManager.processOutgoing(user1Document, user2Document, user3Document);
            p.push(collection3.add(input[2]));
            // drain the outgoing so that the next set will come after
            await documentDeltaEventManager.processOutgoing(user1Document, user2Document, user3Document);
            p.push(collection2.remove());
            // drain the outgoing so that the next set will come after
            await documentDeltaEventManager.processOutgoing(user1Document, user2Document, user3Document);
            p.push(collection3.remove());
            // drain the outgoing so that the next set will come after
            await documentDeltaEventManager.processOutgoing(user1Document, user2Document, user3Document);
            p.push(collection1.remove());
            // drain the outgoing so that the next set will come after
            await documentDeltaEventManager.processOutgoing(user1Document, user2Document, user3Document);
            const removeEmptyP = collection1.remove();

            // Now process all
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
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
            await Promise.all([
                user1Document.close(),
                user2Document.close(),
                user3Document.close(),
            ]);
            await testDeltaConnectionServer.webSocketServer.close();
        });
    });
}

generate("ConsensusQueue", ConsensusQueue, [1, 2, 3], [1, 2, 3]);
generate("ConsensusStack", ConsensusStack, [1, 2, 3], [3, 2, 1]);
