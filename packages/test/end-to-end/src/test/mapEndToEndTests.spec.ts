/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as api from "@fluid-internal/client-api";
import {
    DocumentDeltaEventManager,
    TestDocumentServiceFactory,
    TestResolver,
} from "@microsoft/fluid-local-test-server";
import { ITestDeltaConnectionServer, TestDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { ISharedMap } from "@microsoft/fluid-map";
import { MessageType } from "@microsoft/fluid-protocol-definitions";

describe("Map", () => {
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
        const serviceFactory = new TestDocumentServiceFactory(testDeltaConnectionServer);
        const resolver = new TestResolver();
        user1Document = await api.load(
            id, resolver, {}, serviceFactory);
        documentDeltaEventManager.registerDocuments(user1Document);

        user2Document = await api.load(
            id, resolver, {}, serviceFactory);
        documentDeltaEventManager.registerDocuments(user2Document);

        user3Document = await api.load(
            id, resolver, {}, serviceFactory);
        documentDeltaEventManager.registerDocuments(user3Document);
        root1 = user1Document.getRoot();
        root2 = user2Document.getRoot();
        root3 = user3Document.getRoot();
        await documentDeltaEventManager.pauseProcessing();
        root1.set("testKey1", "testValue");
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
    });

    function expectAllValues(msg, key, value1, value2, value3) {
        const user1Value = root1.get(key);
        assert.equal(user1Value, value1, `Incorrect value for ${key} in document 1 ${msg}`);
        const user2Value = root2.get(key);
        assert.equal(user2Value, value2, `Incorrect value for ${key} in document 2 ${msg}`);
        const user3Value = root3.get(key);
        assert.equal(user3Value, value3, `Incorrect value for ${key} in document 3 ${msg}`);
    }
    function expectAllBeforeValues(key, value1, value2, value3) {
        expectAllValues("before process", key, value1, value2, value3);
    }
    function expectAllAfterValues(key, value) {
        expectAllValues("after process", key, value, value, value);
    }

    function expectAllSize(size) {
        const keys1 = Array.from(root1.keys());
        assert.equal(keys1.length, size, "Incorrect number of Keys in document1");
        const keys2 = Array.from(root2.keys());
        assert.equal(keys2.length, size, "Incorrect number of Keys in document2");
        const keys3 = Array.from(root3.keys());
        assert.equal(keys3.length, size, "Incorrect number of Keys in document3");

        assert.equal(root1.size, size, "Incorrect map size in document1");
        assert.equal(root2.size, size, "Incorrect map size in document2");
        assert.equal(root3.size, size, "Incorrect map size in document3");
    }

    it("should set key value in three documents correctly", async () => {
        expectAllAfterValues("testKey1", "testValue");
    });

    it("should set key value to undefined in three documents correctly", async () => {
        root2.set("testKey1", undefined);
        root2.set("testKey2", undefined);
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
        expectAllAfterValues("testKey1", undefined);
        expectAllAfterValues("testKey2", undefined);
    });

    it("Should delete values in 3 documents correctly", async () => {
        root2.delete("testKey1");
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

        const hasKey1 = root1.has("testKey1");
        assert.equal(hasKey1, false, "testKey1 not deleted in document 1");

        const hasKey2 = root2.has("testKey1");
        assert.equal(hasKey2, false, "testKey1 not deleted in document 1");

        const hasKey3 = root3.has("testKey1");
        assert.equal(hasKey3, false, "testKey1 not deleted in document 1");
    });

    it("Should check if three documents has same number of keys", async () => {
        root3.set("testKey3", true);
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

        // check the number of keys in the map (2 keys set  + insights key = 3)
        expectAllSize(3);
    });

    it("Should update value and trigger onValueChanged on other two documents", async () => {
        let user1ValueChangedCount: number = 0;
        let user2ValueChangedCount: number = 0;
        let user3ValueChangedCount: number = 0;
        root1.on("valueChanged", (changed, local, msg) => {
            if (!local) {
                if (msg.type === MessageType.Operation) {
                    assert.equal(changed.key, "testKey1", "Incorrect value for testKey1 in document 1");
                    user1ValueChangedCount = user1ValueChangedCount + 1;
                }
            }
        });
        root2.on("valueChanged", (changed, local, msg) => {
            if (!local) {
                if (msg.type === MessageType.Operation) {
                    assert.equal(changed.key, "testKey1", "Incorrect value for testKey1 in document 2");
                    user2ValueChangedCount = user2ValueChangedCount + 1;
                }
            }
        });
        root3.on("valueChanged", (changed, local, msg) => {
            if (!local) {
                if (msg.type === MessageType.Operation) {
                    assert.equal(changed.key, "testKey1", "Incorrect value for testKey1 in document 3");
                    user3ValueChangedCount = user3ValueChangedCount + 1;
                }
            }
        });

        root1.set("testKey1", "updatedValue");

        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

        assert.equal(user1ValueChangedCount, 0, "Incorrect number of valueChanged op received in document 1");
        assert.equal(user2ValueChangedCount, 1, "Incorrect number of valueChanged op received in document 2");
        assert.equal(user3ValueChangedCount, 1, "Incorrect number of valueChanged op received in document 3");

        expectAllAfterValues("testKey1", "updatedValue");
    });

    it("Simultaneous set should reach eventual consistency with the same value", async () => {
        root1.set("testKey1", "value1");
        root2.set("testKey1", "value2");
        root3.set("testKey1", "value0");
        root3.set("testKey1", "value3");

        expectAllBeforeValues("testKey1", "value1", "value2", "value3");
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
        expectAllAfterValues("testKey1", "value3");
    });

    it("Simultaneous delete/set should reach eventual consistency with the same value", async () => {
        // set after delete
        root1.set("testKey1", "value1.1");
        root2.delete("testKey1");
        root3.set("testKey1", "value1.3");

        expectAllBeforeValues("testKey1", "value1.1", undefined, "value1.3");
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
        expectAllAfterValues("testKey1", "value1.3");
    });

    it("Simultaneous delete/set on same map should reach eventual consistency with the same value", async () => {
        // delete and then set on the same map
        root1.set("testKey2", "value2.1");
        root2.delete("testKey2");
        root3.set("testKey2", "value2.3");
        // drain the outgoing so that the next set will come after
        await documentDeltaEventManager.processOutgoing(user1Document, user2Document, user3Document);
        root2.set("testKey2", "value2.2");

        expectAllBeforeValues("testKey2", "value2.1", "value2.2", "value2.3");
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
        expectAllAfterValues("testKey2", "value2.2");

    });

    it("Simultaneous set/delete should reach eventual consistency with the same value", async () => {
        // delete after set
        root1.set("testKey3", "value3.1");
        root2.set("testKey3", "value3.2");
        root3.delete("testKey3");

        expectAllBeforeValues("testKey3", "value3.1", "value3.2", undefined);
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
        expectAllAfterValues("testKey3", undefined);
    });

    it("Simultaneous set/clear on a key should reach eventual consistency with the same value", async () => {
        // clear after set
        root1.set("testKey1", "value1.1");
        root2.set("testKey1", "value1.2");
        root3.clear();
        expectAllBeforeValues("testKey1", "value1.1", "value1.2", undefined);
        assert.equal(root3.size, 0, "Incorrect map size after clear");
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
        expectAllAfterValues("testKey1", undefined);
        expectAllSize(0);
    });

    it("Simultaneous clear/set on same map should reach eventual consistency with the same value", async () => {
        // set after clear on the same map
        root1.set("testKey2", "value2.1");
        root2.clear();
        root3.set("testKey2", "value2.3");
        // drain the outgoing so that the next set will come after
        await documentDeltaEventManager.processOutgoing(user1Document, user2Document, user3Document);
        root2.set("testKey2", "value2.2");
        expectAllBeforeValues("testKey2", "value2.1", "value2.2", "value2.3");
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
        expectAllAfterValues("testKey2", "value2.2");
        expectAllSize(1);
    });

    it("Simultaneous clear/set should reach eventual consistency and resolve to the same value", async () => {
        // set after clear
        root1.set("testKey3", "value3.1");
        root2.clear();
        root3.set("testKey3", "value3.3");
        expectAllBeforeValues("testKey3", "value3.1", undefined, "value3.3");
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
        expectAllAfterValues("testKey3", "value3.3");
        expectAllSize(1);
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
