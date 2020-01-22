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

interface IAugmentedDocumentMessage {
    clientId: string,
    message: IDocumentMessage,
}

/**
 * Server implementation used by Creation driver.
 */
export class CreationServerMessagesHandler {

    private static instance: CreationServerMessagesHandler;

    private sequenceNumber: number = 1;
    private minSequenceNumber: number = 0;
    private static totalClients: number = 0;

    public readonly opSubmitManager: BatchManager<IAugmentedDocumentMessage[]>;

    private static readonly connections: IDocumentDeltaConnection[]= [];

    // These are the queues for messages, signals, contents that will be pushed to server when
    // an actual connection is created.
    public readonly queuedMessages: ISequencedDocumentMessage[] = [];

    private constructor(private readonly documentId: string) {
        this.opSubmitManager = new BatchManager<IAugmentedDocumentMessage[]>(
            (submitType, work) => {
                for (const singleWork of work) {
                    for (const message of singleWork) {
                        const stampedMessage = this.stampMessage(message.message, message.clientId);
                        this.queuedMessages.push(stampedMessage);
                        for (const connection of CreationServerMessagesHandler.connections) {
                            connection.emit("op", this.documentId, stampedMessage);
                        }
                    }
                }
            }, Number.MAX_VALUE);
    }

    public static getInstance(
        documentId?: string,
        connection?: IDocumentDeltaConnection): CreationServerMessagesHandler {
        if (CreationServerMessagesHandler.instance === undefined) {
            if (documentId) {
                CreationServerMessagesHandler.instance = new CreationServerMessagesHandler(documentId);
            }
        }

        if (connection) {
            CreationServerMessagesHandler.totalClients += 1;
            this.connections.push(connection);
        }
        return CreationServerMessagesHandler.instance;
    }

    public createClientId() {
        return `random-random${CreationServerMessagesHandler.totalClients}`;
    }

    public isDocExisting() {
        return CreationServerMessagesHandler.totalClients === 0 ? false : true;
    }

    /**
     * Messages to be processed by the server.
     * @param messages - List of messages to be stamped.
     * @param clientId - client id of the client sending the messages.
     */
    public submitMessage(messages: IDocumentMessage[], clientId: string) {
        for (const message of messages) {
            const augMessage: IAugmentedDocumentMessage = {
                clientId,
                message,
            };
            this.opSubmitManager.add("submitOp", [augMessage]);
        }
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

    /**
     * Creates the client join message.
     * @param clientDetail - Client details
     */
    public createClientJoinMessage(clientDetail: IClientJoin): ISequencedDocumentMessage {
        const joinMessage: ISequencedDocumentSystemMessage = {
            clientId: clientDetail.clientId,
            clientSequenceNumber: 0,
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
