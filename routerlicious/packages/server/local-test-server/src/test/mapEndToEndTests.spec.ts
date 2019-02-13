/* tslint:disable:no-unsafe-any */
/* tslint:disable:no-backbone-get-set-outside-model  */
import * as api from "@prague/client-api";
import { MessageType } from "@prague/container-definitions";
import { IMapView } from "@prague/map";
import { generateToken } from "@prague/services-core";
import * as socketStorage from "@prague/socket-storage";
import * as assert from "assert";

import {
    createTestDocumentService,
    DocumentDeltaEventManager,
    ITestDeltaConnectionServer,
    TestDeltaConnectionServer,
} from "..";

describe.skip("Map", () => {
    const id = "documentId";
    const tenatId = "tenantId";
    const tokenKey = "tokenKey";

    let testDeltaConnectionServer: ITestDeltaConnectionServer;
    let documentDeltaEventManager: DocumentDeltaEventManager;
    let user1Document: api.Document;
    let user2Document: api.Document;
    let user3Document: api.Document;
    let rootView1: IMapView;
    let rootView2: IMapView;
    let rootView3: IMapView;

    beforeEach(async () => {

        testDeltaConnectionServer = TestDeltaConnectionServer.Create();
        documentDeltaEventManager = new DocumentDeltaEventManager();
        const documentService = createTestDocumentService(testDeltaConnectionServer);
        const tokenProvider1 = new socketStorage.TokenProvider(generateToken(tenatId, id, tokenKey));
        const tokenProvider2 = new socketStorage.TokenProvider(generateToken(tenatId, id, tokenKey));
        const tokenProvider3 = new socketStorage.TokenProvider(generateToken(tenatId, id, tokenKey));
        user1Document = await api.load(id, tenatId, tokenProvider1, {}, null, true, documentService);
        documentDeltaEventManager.registerDocuments(user1Document);

        user2Document = await api.load(id, tenatId, tokenProvider2, {}, null, true, documentService);
        documentDeltaEventManager.registerDocuments(user2Document);

        user3Document = await api.load(id, tenatId, tokenProvider3, {}, null, true, documentService);
        documentDeltaEventManager.registerDocuments(user3Document);
        rootView1 = await user1Document.getRoot().getView();
        rootView2 = await user2Document.getRoot().getView();
        rootView3 = await user3Document.getRoot().getView();
        documentDeltaEventManager.pauseProcessing();
        rootView1.set("testKey1", "testValue");
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
    });

    it("should set key value in three documents correctly", async () => {
        const user1Value = rootView1.get("testKey1") as string;
        assert.equal(user1Value, "testValue", "Incorrect value for testKey1 in document 1");
        const user2Value = rootView2.get("testKey1") as string;
        assert.equal(user2Value, "testValue", "Incorrect value for testKey1 in document 2");
        const user3Value = rootView3.get("testKey1") as string;
        assert.equal(user3Value, "testValue", "Incorrect value for testKey1 in document 3");

    });

    it("Should delete values in 3 documents correctly", async () => {
        rootView2.delete("testKey1");
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

        const hasKey1 = rootView1.has("testKey1");
        assert.equal(hasKey1, false, "testKey1 not deleted in document 1");

        const hasKey2 = rootView2.has("testKey1");
        assert.equal(hasKey2, false, "testKey1 not deleted in document 1");

        const hasKey3 = rootView3.has("testKey1");
        assert.equal(hasKey3, false, "testKey1 not deleted in document 1");
    });

    it("Should check if three documents has same number of keys", async () => {
        rootView3.set("testKey3", true);
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

        // check the number of keys in the map (2 keys set  + insights key = 3)
        const keys1 = Array.from(rootView1.keys());
        assert.equal(keys1.length, 3, "Incorrect number of Keys in document1");
        const keys2 = Array.from(rootView2.keys());
        assert.equal(keys2.length, 3, "Incorrect number of Keys in document2");
        const keys3 = Array.from(rootView3.keys());
        assert.equal(keys3.length, 3, "Incorrect number of Keys in document3");
    });

    it("Should update value and trigger onValueChanged on other two documents", async () => {
        let user1ValueChangedCount: number = 0;
        let user2ValueChangedCount: number = 0;
        let user3ValueChangedCount: number = 0;
        rootView1.getMap().on("valueChanged", (changed, local, msg) => {
            if (!local) {
                if (msg.type === MessageType.Operation) {
                    assert.equal(changed.key, "testKey1", "Incorrect value for testKey1 in document 1");
                    user1ValueChangedCount = user1ValueChangedCount + 1;
                }
            }
        });
        rootView2.getMap().on("valueChanged", (changed, local, msg) => {
            if (!local) {
                if (msg.type === MessageType.Operation) {
                    assert.equal(changed.key, "testKey1", "Incorrect value for testKey1 in document 2");
                    user2ValueChangedCount = user2ValueChangedCount + 1;
                }
            }
        });
        rootView3.getMap().on("valueChanged", (changed, local, msg) => {
            if (!local) {
                if (msg.type === MessageType.Operation) {
                    assert.equal(changed.key, "testKey1", "Incorrect value for testKey1 in document 3");
                    user3ValueChangedCount = user3ValueChangedCount + 1;
                }
            }
        });

        rootView1.set("testKey1", "updatedValue");

        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

        assert.equal(user1ValueChangedCount, 0, "Incorrect number of valueChanged op received in document 1");
        assert.equal(user2ValueChangedCount, 1, "Incorrect number of valueChanged op received in document 2");
        assert.equal(user3ValueChangedCount, 1, "Incorrect number of valueChanged op received in document 3");

        const user1Value = rootView1.get("testKey1") as string;
        assert.equal(user1Value, "updatedValue", "Incorrect value for testKey1 in document 1 after update");
        const user2Value = rootView2.get("testKey1") as string;
        assert.equal(user2Value, "updatedValue", "Incorrect value for testKey1 in document 2 after update");
        const user3Value = rootView3.get("testKey1") as string;
        assert.equal(user3Value, "updatedValue", "Incorrect value for testKey1 in document 3 after update");

    });
    afterEach(async () => {
        user1Document.close();
        user2Document.close();
        user3Document.close();
        await testDeltaConnectionServer.webSocketServer.close();
    });
});
