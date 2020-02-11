/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { Document, load } from "@fluid-internal/client-api";
import {
    DocumentDeltaEventManager,
    TestDocumentServiceFactory,
    TestResolver,
} from "@microsoft/fluid-local-test-server";
import { ITestDeltaConnectionServer, TestDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
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
            id, resolver, {}, serviceFactory);

        user2Document = await load(
            id, resolver, {}, serviceFactory);
        documentDeltaEventManager.registerDocuments(user1Document, user2Document);
    });

    describe("Attach signal Handlers on Both Clients", () => {
        it("Validate component runtime signals", async () => {
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
            await documentDeltaEventManager.process();
            assert.equal(user1SignalReceivedCount, 1, "client 1 did not received signal");
            assert.equal(user2SignalReceivedCount, 1, "client 2 did not received signal");

            user2Document.runtime.submitSignal("TestSignal", true);
            await documentDeltaEventManager.process();
            assert.equal(user1SignalReceivedCount, 2, "client 1 did not received signal");
            assert.equal(user2SignalReceivedCount, 2, "client 2 did not received signal");

        });

        it("Validate host runtime signals", async () => {
            let user1SignalReceivedCount = 0;
            let user2SignalReceivedCount = 0;
            const user1HostRuntime = user1Document.context.hostRuntime;
            const user2HostRuntime = user2Document.context.hostRuntime;

            user1HostRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
                if (message.type === "TestSignal") {
                    user1SignalReceivedCount += 1;
                }
            });

            user2HostRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
                if (message.type === "TestSignal") {
                    user2SignalReceivedCount += 1;
                }
            });

            user1HostRuntime.submitSignal("TestSignal", true);
            await documentDeltaEventManager.process();
            assert.equal(user1SignalReceivedCount, 1, "client 1 did not receive signal");
            assert.equal(user2SignalReceivedCount, 1, "client 2 did not receive signal");

            user2HostRuntime.submitSignal("TestSignal", true);
            await documentDeltaEventManager.process();
            assert.equal(user1SignalReceivedCount, 2, "client 1 did not receive signal");
            assert.equal(user2SignalReceivedCount, 2, "client 2 did not receive signal");
        });
    });

    it("Validate signal events are raised on the correct runtime", async () => {
        let user1HostSignalReceivedCount = 0;
        let user2HostSignalReceivedCount = 0;
        let user1CompSignalReceivedCount = 0;
        let user2CompSignalReceivedCount = 0;
        const user1HostRuntime = user1Document.context.hostRuntime;
        const user2HostRuntime = user2Document.context.hostRuntime;
        const user1ComponentRuntime = user1Document.runtime;
        const user2ComponentRuntime = user2Document.runtime;

        user1ComponentRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
            if (message.type === "TestSignal") {
                user1CompSignalReceivedCount += 1;
            }
        });

        user2ComponentRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
            if (message.type === "TestSignal") {
                user2CompSignalReceivedCount += 1;
            }
        });

        user1HostRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
            if (message.type === "TestSignal") {
                user1HostSignalReceivedCount += 1;
            }
        });

        user2HostRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
            if (message.type === "TestSignal") {
                user2HostSignalReceivedCount += 1;
            }
        });

        user1HostRuntime.submitSignal("TestSignal", true);
        await documentDeltaEventManager.process();
        assert.equal(user1HostSignalReceivedCount, 1, "client 1 did not receive signal on host runtime");
        assert.equal(user2HostSignalReceivedCount, 1, "client 2 did not receive signal on host runtime");
        assert.equal(user1CompSignalReceivedCount, 0, "client 1 should not receive signal on component runtime");
        assert.equal(user2CompSignalReceivedCount, 0, "client 2 should not receive signal on component runtime");

        user2ComponentRuntime.submitSignal("TestSignal", true);
        await documentDeltaEventManager.process();
        assert.equal(user1HostSignalReceivedCount, 1, "client 1 should not receive signal on host runtime");
        assert.equal(user2HostSignalReceivedCount, 1, "client 2 should not receive signal on host runtime");
        assert.equal(user1CompSignalReceivedCount, 1, "client 1 did not receive signal on component runtime");
        assert.equal(user2CompSignalReceivedCount, 1, "client 2 did not receive signal on component runtime");
    });

    afterEach(async () => {
        await Promise.all([
            user1Document.close(),
            user2Document.close(),
        ]);
        await testDeltaConnectionServer.webSocketServer.close();
    });
});
