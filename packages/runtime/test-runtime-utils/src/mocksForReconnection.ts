/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
    IMockContainerRuntimePendingMessage,
    MockContainerRuntime,
    MockContainerRuntimeFactory,
    MockFluidDataStoreRuntime,
} from "./mocks";

/**
 * Specalized implementation of MockContainerRuntime for testing ops during reconnection.
 */
export class MockContainerRuntimeForReconnection extends MockContainerRuntime {
    /**
     * Contains messages from other clients that were sequenced while this runtime was marked as disconnected.
     */
    private readonly pendingRemoteMessages: ISequencedDocumentMessage[] = [];

    public get connected(): boolean {
        return this._connected;
    }

    public set connected(connected: boolean) {
        if (this._connected === connected) {
            return;
        }

        this._connected = connected;

        if (connected) {
            for (const remoteMessage of this.pendingRemoteMessages) {
                this.process(remoteMessage);
            }
            this.pendingRemoteMessages.length = 0;
            this.clientSequenceNumber = 0;
            // We should get a new clientId on reconnection.
            this.clientId = uuid();
            // Update the clientId in FluidDataStoreRuntime.
            this.dataStoreRuntime.clientId = this.clientId;
            // On reconnection, ask the DDSes to resubmit pending messages.
            this.reSubmitMessages();
        } else {
            const factory = this.factory as MockContainerRuntimeFactoryForReconnection;
            // On disconnection, clear any outstanding messages for this client because it will be resent.
            factory.clearOutstandingClientMessages(this.clientId);
        }

        // Let the DDSes know that the connection state changed.s
        this.deltaConnections.forEach((dc) => {
            dc.setConnectionState(this.connected);
        });
    }

    private _connected = true;

    constructor(
        dataStoreRuntime: MockFluidDataStoreRuntime,
        factory: MockContainerRuntimeFactoryForReconnection) {
        super(dataStoreRuntime, factory);
    }

    public process(message: ISequencedDocumentMessage) {
        if (this.connected) {
            super.process(message);
        } else {
            this.pendingRemoteMessages.push(message);
        }
    }

    public submit(messageContent: any, localOpMetadata: unknown) {
        // Submit messages only if we are connection, otherwise, just add it to the pending queue.
        if (this.connected) {
            return super.submit(messageContent, localOpMetadata);
        }

        this.addPendingMessage(messageContent, localOpMetadata, -1);
        return -1;
    }

    private reSubmitMessages() {
        let messageCount = this.pendingMessages.length;
        while (messageCount > 0) {
            const pendingMessage: IMockContainerRuntimePendingMessage = this.pendingMessages.shift();
            this.deltaConnections.forEach((dc) => {
                dc.reSubmit(pendingMessage.content, pendingMessage.localOpMetadata);
            });
            messageCount--;
        }
    }
}

/**
 * Specalized implementation of MockContainerRuntimeFactory for testing ops during reconnection.
 */
export class MockContainerRuntimeFactoryForReconnection extends MockContainerRuntimeFactory {
    public createContainerRuntime(dataStoreRuntime: MockFluidDataStoreRuntime): MockContainerRuntimeForReconnection {
        const containerRuntime = new MockContainerRuntimeForReconnection(dataStoreRuntime, this);
        this.runtimes.push(containerRuntime);
        return containerRuntime;
    }

    public clearOutstandingClientMessages(clientId: string) {
        // Delete all the messages for client with the given clientId.
        this.messages = this.messages.filter((message: ISequencedDocumentMessage) => {
            return message.clientId !== clientId;
        });
    }
}
