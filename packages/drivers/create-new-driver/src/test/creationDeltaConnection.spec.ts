/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IDocumentDeltaConnection, IDocumentService, IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { IClient, IDocumentMessage, MessageType, ScopeType } from "@fluidframework/protocol-definitions";
import { CreationDocumentServiceFactory } from "../creationDocumentServiceFactory";
import { CreationDriverUrlResolver } from "../creationDriverUrlResolver";
import { CreationServerMessagesHandler } from "..";

describe("Creation Driver", () => {
    let service: IDocumentService;
    let client: IClient;
    let documentDeltaConnection1: IDocumentDeltaConnection;
    let documentDeltaConnection2: IDocumentDeltaConnection;
    const docId = "docId";
    let resolved: IFluidResolvedUrl;
    beforeEach(async () => {
        const resolver: CreationDriverUrlResolver = new CreationDriverUrlResolver();
        const factory = new CreationDocumentServiceFactory();
        resolved = (await resolver.resolve({ url: `http://fluid.com?uniqueId=${docId}` })) as IFluidResolvedUrl;
        service = await factory.createDocumentService(resolved);
        client = {
            mode: "write",
            details: { capabilities: { interactive: false } },
            permission: ["write"],
            scopes: [ScopeType.DocWrite],
            user: { id: "user1" },
        };
    });

    const delay = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    it("Initial driver connection details", async () => {
        documentDeltaConnection1 = await service.connectToDeltaStream(client);
        documentDeltaConnection2 = await service.connectToDeltaStream(client);
        assert.equal(documentDeltaConnection1.mode, "write", "Connection mode should be write.");
        assert.equal(documentDeltaConnection1.existing, false, "Document should not be existing.");
        assert.equal(documentDeltaConnection2.existing, true, "Document should be existing for second connection.");
        assert.equal(documentDeltaConnection1.initialMessages?.length, 1, "Join message should be fired.");
        assert.equal(documentDeltaConnection2.initialMessages?.length, 1, "Join message should be fired.");
    });

    it("Server messages test", async () => {
        const message: IDocumentMessage = {
            clientSequenceNumber: 1,
            contents: {},
            referenceSequenceNumber: 0,
            type: MessageType.Operation,
        };
        const creationServerMessagesHandler =
            CreationServerMessagesHandler.getInstance(docId);
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
