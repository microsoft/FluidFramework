/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { Document, load } from "@fluid-internal/client-api";
import {
    DocumentDeltaEventManager,
    ITestDeltaConnectionServer,
    TestDeltaConnectionServer,
    TestDocumentServiceFactory,
    TestResolver,
} from "@microsoft/fluid-local-test-server";
import { IInboundSignalMessage } from "@microsoft/fluid-runtime-definitions";

describe("TestSignals", () => {
    const id = "fluid-test://test.com/test/test";

    let testDeltaConnectionServer: ITestDeltaConnectionServer;
    let documentDeltaEventManager: DocumentDeltaEventManager;
    let user1Document: Document;
    let user2Document: Document;

    beforeEach(async () => {
        testDeltaConnectionServer = TestDeltaConnectionServer.create();
        documentDeltaEventManager = new DocumentDeltaEventManager(testDeltaConnectionServer);

        const resolver = new TestResolver();
        const serviceFactory = new TestDocumentServiceFactory(testDeltaConnectionServer);
        user1Document = await load(
            id, { resolver }, {}, serviceFactory);

        user2Document = await load(
            id, { resolver }, {}, serviceFactory);
        documentDeltaEventManager.registerDocuments(user1Document, user2Document);
    });

    describe("Attach signal Handlers on Both Clients", () => {
        it("Validate signals", async () => {
            let user1SignalReceivedCount = 0;
            let user2SignalReceivedCount = 0;

            user1Document.runtime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
                if (message.type === "TestSignal") {
                    user1SignalReceivedCount += 1;
                }
            });

            user2Document.runtime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
                if (message.type === "TestSignal") {
                    user2SignalReceivedCount += 1;
                }
            });

            user1Document.runtime.submitSignal("TestSignal", true);
            assert.equal(user1SignalReceivedCount, 1, "client 1 did not received signal");
            assert.equal(user2SignalReceivedCount, 1, "client 2 did not received signal");

            user2Document.runtime.submitSignal("TestSignal", true);
            assert.equal(user1SignalReceivedCount, 2, "client 1 did not received signal");
            assert.equal(user2SignalReceivedCount, 2, "client 2 did not received signal");

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
