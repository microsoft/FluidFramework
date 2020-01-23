/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IDocumentDeltaConnection, IResolvedUrl, IDocumentService } from "@microsoft/fluid-driver-definitions";
import { IClient, ScopeType, IDocumentMessage, MessageType } from "@microsoft/fluid-protocol-definitions";
import { CreationDocumentServiceFactory } from "../creationDocumentServiceFactory";
import { CreationServerMessagesHandler } from "..";

describe("Creation Driver", () => {

    let service: IDocumentService;
    let client: IClient;
    let documentDeltaConnection1: IDocumentDeltaConnection;
    let documentDeltaConnection2: IDocumentDeltaConnection;
    beforeEach(async () => {
        const factory = new CreationDocumentServiceFactory("docId", "tenantId");
        const resolved: IResolvedUrl = {endpoints: {}, type: "fluid", url: "", tokens: {}};
        service = await factory.createDocumentService(resolved);
        client = {
            mode: "write",
            details: {capabilities: {interactive: false}},
            permission: ["write"],
            scopes: [ScopeType.DocWrite],
            user: {id: "user1"},
        };
    });

    const delay = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    it("Initial driver connection details", async () => {
        documentDeltaConnection1 = await service.connectToDeltaStream(client, "write");
        documentDeltaConnection2 = await service.connectToDeltaStream(client, "write");
        assert.equal(documentDeltaConnection1.mode, "write", "Connection mode should be write.");
        assert.equal(documentDeltaConnection1.existing, false, "Document should not be existing.");
        assert.equal(documentDeltaConnection2.existing, true, "Document should be existing for second connection.");
        assert.equal(documentDeltaConnection1.initialMessages?.length, 1, "Join message should be fired.");
    });

    it("Server messages test", async () => {
        const message: IDocumentMessage = {
            clientSequenceNumber: 1,
            contents: {},
            referenceSequenceNumber: 0,
            type: MessageType.Operation,
        };
        const creationServerMessagesHandler = CreationServerMessagesHandler.getInstance();
        assert.equal(creationServerMessagesHandler.queuedMessages.length, 2,
            "Total messages should be 2 at this time including join messages");
        documentDeltaConnection1.submit([message]);
        documentDeltaConnection2.submit([message]);
        await delay(0);
        const queueLength: number = creationServerMessagesHandler.queuedMessages.length;
        assert.equal(queueLength, 4,
            "Total messages should be 4 at this time including join message");
        assert.equal(creationServerMessagesHandler.queuedMessages[queueLength - 1].sequenceNumber, 4,
            "Sequence number should be 4");
    });
});
