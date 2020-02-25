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
} from "@microsoft/fluid-local-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { MessageType } from "@microsoft/fluid-protocol-definitions";
import { SharedString } from "@microsoft/fluid-sequence";

describe("LocalTestServer", () => {
    const id = "fluid://test.com/test/test";

    let testDeltaConnectionServer: ILocalDeltaConnectionServer;
    let documentDeltaEventManager: DocumentDeltaEventManager;
    let user1Document: api.Document;
    let user2Document: api.Document;
    let user1SharedString: SharedString;
    let user2SharedString: SharedString;

    beforeEach(async () => {
        testDeltaConnectionServer = LocalDeltaConnectionServer.create();
        documentDeltaEventManager = new DocumentDeltaEventManager(testDeltaConnectionServer);

        const resolver = new TestResolver();
        const serviceFactory = new TestDocumentServiceFactory(testDeltaConnectionServer);
        user1Document = await api.load(
            id, resolver, {}, serviceFactory);
        let root = user1Document.getRoot();
        user1SharedString = user1Document.createString();
        root.set("SharedString", user1SharedString.handle);
        documentDeltaEventManager.registerDocuments(user1Document);

        user2Document = await api.load(
            id, resolver, {}, serviceFactory);
        root = user2Document.getRoot();
        const handle = await root.wait<IComponentHandle>("SharedString");
        user2SharedString = await handle.get<SharedString>();
        documentDeltaEventManager.registerDocuments(user2Document);
    });

    describe("Document.existing", () => {
        it("Validate document is new for user1 1 and exists for client 2", () => {
            assert.equal(user1Document.existing, false, "Document already exists");
            assert.equal(user2Document.existing, true, "Document does not exist on the server");
            assert.notEqual(user2SharedString, undefined, "Document does not contain a SharedString");
        });
    });

    describe("Attach Op Handlers on Both Clients", () => {
        it("Validate messaging", async () => {
            let user1ReceivedMsgCount: number = 0;
            let user2ReceivedMsgCount: number = 0;

            user1SharedString.on("op", (msg, local) => {
                if (!local) {
                    if (msg.type === MessageType.Operation) {
                        user1ReceivedMsgCount = user1ReceivedMsgCount + 1;
                    }
                }
            });

            user2SharedString.on("op", (msg, local) => {
                if (!local) {
                    if (msg.type === MessageType.Operation) {
                        user2ReceivedMsgCount = user2ReceivedMsgCount + 1;
                    }
                }
            });

            await documentDeltaEventManager.pauseProcessing();

            user1SharedString.insertText(0, "A");
            user2SharedString.insertText(0, "C");
            assert.equal(user1ReceivedMsgCount, 0, "User1 received message count is incorrect");
            assert.equal(user2ReceivedMsgCount, 0, "User2 received message count is incorrect");

            await documentDeltaEventManager.processOutgoing(user1Document);
            assert.equal(user1ReceivedMsgCount, 0, "User1 received message count is incorrect");
            assert.equal(user2ReceivedMsgCount, 0, "User2 received message count is incorrect");

            await documentDeltaEventManager.process(user2Document);
            assert.equal(user1ReceivedMsgCount, 0, "User1 received message count is incorrect");
            assert.equal(user2ReceivedMsgCount, 1, "User2 received message count is incorrect");

            await documentDeltaEventManager.processIncoming(user1Document);
            assert.equal(user1ReceivedMsgCount, 1, "User1 received message count is incorrect");
            assert.equal(user2ReceivedMsgCount, 1, "User2 received message count is incorrect");

            user1SharedString.insertText(0, "B");
            await documentDeltaEventManager.process(user1Document, user2Document);

            assert.equal(user1SharedString.getText(), user2SharedString.getText());
            assert.equal(user1SharedString.getText().length, 3, user1SharedString.getText());
            assert.equal(user1ReceivedMsgCount, 1, "User1 received message count is incorrect");
            assert.equal(user2ReceivedMsgCount, 2, "User2 received message count is incorrect");
        });
    });

    afterEach(async () => {
        await Promise.all([
            user1Document.close(),
            user2Document.close(),
        ]);
        await testDeltaConnectionServer.webSocketServer.close();
    });
});
