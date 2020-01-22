/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import {
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISequencedDocumentSystemMessage,
    IClientJoin,
} from "@microsoft/fluid-protocol-definitions";
import { BatchManager } from "@microsoft/fluid-core-utils";
import { IDocumentDeltaConnection } from "@microsoft/fluid-driver-definitions";

/**
 * Provides access to the false delta storage.
 */
export class CreationServerMessagesHandler {

    private static instance: CreationServerMessagesHandler;

    private sequenceNumber: number = 1;
    private minSequenceNumber: number = 0;
    public readonly opSubmitManager: BatchManager<IDocumentMessage[]>;

    private static readonly connections: IDocumentDeltaConnection[]= [];

    // These are the queues for messages, signals, contents that will be pushed to server when
    // an actual connection is created.
    public readonly queuedMessages: ISequencedDocumentMessage[] = [];

    private constructor() {
        this.opSubmitManager = new BatchManager<IDocumentMessage[]>(
            (submitType, work, clientId?: string, documentId?: string) => {
                assert.ok(clientId !== undefined, "Client id should be provided.");
                assert.ok(documentId !== undefined, "documentId should be provided.");
                for (const singleWork of work) {
                    for (const message of singleWork) {
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        const stampedMessage = this.stampMessage(message, clientId!);
                        this.queuedMessages.push(stampedMessage);
                        for (const connection of CreationServerMessagesHandler.connections) {
                            connection.emit("op", documentId, stampedMessage);
                        }
                    }
                }
            }, Number.MAX_VALUE);
    }

    public static getInstance(connection: IDocumentDeltaConnection): CreationServerMessagesHandler {
        if (CreationServerMessagesHandler.instance !== undefined) {
            CreationServerMessagesHandler.instance = new CreationServerMessagesHandler();
        }

        this.connections.push(connection);
        return CreationServerMessagesHandler.instance;
    }

    /**
     * Stamps the messages like a server.
     * @param message - Message to be stamped.
     */
    public stampMessage(message: IDocumentMessage, clientId: string): ISequencedDocumentMessage {
        const stampedMessage: ISequencedDocumentMessage = {
            clientId,
            clientSequenceNumber: message.clientSequenceNumber,
            contents: message.contents,
            minimumSequenceNumber: message.referenceSequenceNumber,
            referenceSequenceNumber: message.referenceSequenceNumber,
            sequenceNumber: this.sequenceNumber++,
            timestamp: Date.now(),
            traces: message.traces !== undefined ? message.traces : [],
            type: message.type,
            metadata: message.metadata,
        };
        this.minSequenceNumber = stampedMessage.minimumSequenceNumber;
        assert.ok(stampedMessage.referenceSequenceNumber < this.sequenceNumber,
            "Reference seq number should be less than the current seq number");
        return stampedMessage;
    }

    public createClientJoinMessage(clientDetail: IClientJoin): ISequencedDocumentMessage {
        const joinMessage: ISequencedDocumentSystemMessage = {
            clientId: clientDetail.clientId,
            clientSequenceNumber: -1,
            contents: null,
            minimumSequenceNumber: this.minSequenceNumber,
            referenceSequenceNumber: -1,
            sequenceNumber: this.sequenceNumber++,
            timestamp: Date.now(),
            traces: [],
            data: JSON.stringify(clientDetail),
            type: "join",
        };
        return joinMessage;
    }
}
