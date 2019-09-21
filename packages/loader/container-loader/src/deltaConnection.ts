/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IConnectionDetails,
} from "@microsoft/fluid-container-definitions";
import {
    ConnectionMode,
    IClient,
    IContentMessage,
    IDocumentDeltaConnection,
    IDocumentMessage,
    IDocumentService,
    INack,
    ISequencedDocumentMessage,
    ISignalMessage,
} from "@microsoft/fluid-protocol-definitions";
import { EventEmitter } from "events";

export class DeltaConnection extends EventEmitter {
    public static async connect(
        service: IDocumentService,
        client: IClient,
        mode: ConnectionMode) {
        const connection = await service.connectToDeltaStream(client, mode);
        return new DeltaConnection(connection);
    }

    public get details(): IConnectionDetails {
        return this._details;
    }

    public get nacked(): boolean {
        return this._nacked;
    }

    public get connected(): boolean {
        return this._connected;
    }

    private readonly _details: IConnectionDetails;
    private _nacked = false;
    private _connected = true;

    private constructor(private readonly connection: IDocumentDeltaConnection) {
        super();

        this._details = {
            claims: connection.claims,
            clientId: connection.clientId,
            existing: connection.existing,
            initialContents: connection.initialContents,
            initialMessages: connection.initialMessages,
            initialSignals: connection.initialSignals,
            maxMessageSize: connection.maxMessageSize,
            mode: connection.mode,
            parentBranch: connection.parentBranch,
            serviceConfiguration: connection.serviceConfiguration,
            version: connection.version,
        };

        // listen for new messages
        connection.on("op", (documentId: string, messages: ISequencedDocumentMessage[]) => {
            this.emit("op", documentId, messages);
        });

        connection.on("op-content", (message: IContentMessage) => {
            this.emit("op-content", message);
        });

        connection.on("signal", (signal: ISignalMessage) => {
            this.emit("signal", signal);
        });

        connection.on("nack", (documentId: string, message: INack[]) => {
            // Mark nacked and also pause any outbound communication
            this._nacked = true;
            const target = message[0].sequenceNumber;
            this.emit("nack", target);
        });

        connection.on("disconnect", (reason) => {
            this._connected = false;
            this.emit("disconnect", reason);
        });

        // Listen for socket.io latency messages
        connection.on("pong", (latency: number) => {
            this.emit("pong", latency);
        });

        connection.on("error", (error) => {
            this.emit("error", error);
        });
    }

    /**
     * Closes the delta connection. This disconnects the socket and clears any listeners
     */
    public close() {
        this._connected = false;
        this.connection.disconnect();
        this.removeAllListeners();
    }

    public submit(messages: IDocumentMessage[]): void {
        this.connection.submit(messages);
    }

    public async submitAsync(messages: IDocumentMessage[]): Promise<void> {
        return this.connection.submitAsync(messages);
    }

    public submitSignal(message: any): void {
        return this.connection.submitSignal(message);
    }
}
