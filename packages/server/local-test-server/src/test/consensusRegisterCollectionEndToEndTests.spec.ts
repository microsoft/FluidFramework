import * as api from "@prague/client-api";
import {
    ConsensusRegisterCollectionExtension,
    IConsensusRegisterCollection,
} from "@prague/consensus-register-collection";
import { ISharedMap } from "@prague/map";
import * as assert from "assert";
import {
    DocumentDeltaEventManager,
    ITestDeltaConnectionServer,
    TestDeltaConnectionServer,
    TestDocumentServiceFactory,
    TestResolver,
} from "..";

generate("ConsensusRegisterCollection", ConsensusRegisterCollectionExtension.Type);
function generate(name: string, type: string) {
    describe(name, () => {
        const id = "prague://test.com/test/test";

        let testDeltaConnectionServer: ITestDeltaConnectionServer;
        let documentDeltaEventManager: DocumentDeltaEventManager;
        let user1Document: api.Document;
        let user2Document: api.Document;
        let user3Document: api.Document;
        let root1: ISharedMap;
        let root2: ISharedMap;
        let root3: ISharedMap;

        beforeEach(async () => {
            testDeltaConnectionServer = TestDeltaConnectionServer.Create();
            documentDeltaEventManager = new DocumentDeltaEventManager(testDeltaConnectionServer);
            const documentService = new TestDocumentServiceFactory(testDeltaConnectionServer);
            const resolver = new TestResolver();
            user1Document = await api.load(
                id, { resolver }, {}, documentService);
            documentDeltaEventManager.registerDocuments(user1Document);

            user2Document = await api.load(
                id, { resolver }, {}, documentService);
            documentDeltaEventManager.registerDocuments(user2Document);

            user3Document = await api.load(
                id, { resolver }, {}, documentService);
            documentDeltaEventManager.registerDocuments(user3Document);
            root1 = user1Document.getRoot();
            root2 = user2Document.getRoot();
            root3 = user3Document.getRoot();
        });

        it("Should not work before attach", async () => {
            const collection1 = user1Document.create(type) as IConsensusRegisterCollection;
            collection1.write("test-key", "test-value").then(() => {
                assert(false, "Writing to local did not fail");
            }).catch((reason) => {
                assert(true, "Writing to local should fail");
            });
        });

        it("Should work after attach", async () => {
            const collection1 = user1Document.create(type) as IConsensusRegisterCollection;
            root1.set("collection", collection1);
            await collection1.write("key1", "value1");
            await collection1.write("key2", "value2");

            const collection2 = await root2.wait<IConsensusRegisterCollection>("collection");
            const collection3 = await root3.wait<IConsensusRegisterCollection>("collection");

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
