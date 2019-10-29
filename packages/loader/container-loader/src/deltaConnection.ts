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
        // Populate details on demand.
        // This is required not to miss any ops!
        // DeltaConnection.connect() is async, and as result there is a time window where runtime has not yet installed
        // its op handler, and driver already removed its earlyOpHandler.
        // As result, we raise op events without nobody listening for them!
        // Given that some storage implementations may have slow propagation of ops form delta stream to storage, that
        // can affect user experience in rather visible ways.
        // Work around for it - drivers can continue to accumulate ops until
        // initialMessages / initialSignals / initialContents are fetched
        if (this._details === undefined) {
            this._details = {
                claims: this.connection.claims,
                clientId: this.connection.clientId,
                existing: this.connection.existing,
                initialClients: this.connection.initialClients,
                initialContents: this.connection.initialContents,
                initialMessages: this.connection.initialMessages,
                initialSignals: this.connection.initialSignals,
                maxMessageSize: this.connection.maxMessageSize,
                mode: this.connection.mode,
                parentBranch: this.connection.parentBranch,
                serviceConfiguration: this.connection.serviceConfiguration,
                version: this.connection.version,
            };
        }
        return this._details;
    }

    public get nacked(): boolean {
        return this._nacked;
    }

    public get connected(): boolean {
        return this._connected;
    }

    private _details: IConnectionDetails | undefined;
    private _nacked = false;
    private _connected = true;

    private constructor(private readonly connection: IDocumentDeltaConnection) {
        super();

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
