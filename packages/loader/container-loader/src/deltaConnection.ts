/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IConnectionDetails,
    IDocumentDeltaConnection,
    IDocumentService,
} from "@microsoft/fluid-container-definitions";
import {
    ConnectionMode,
    IClient,
    IDocumentMessage,
    INack,
} from "@microsoft/fluid-protocol-definitions";
import * as assert from "assert";
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

    private readonly forwardEvents = ["op", "op-content", "signal", "error", "pong"];
    private readonly nonForwardEvents = ["nack", "disconnect"];

    private constructor(private readonly connection: IDocumentDeltaConnection) {
        super();

        this._details = {
            claims: connection.claims,
            clientId: connection.clientId,
            existing: connection.existing,
            get initialClients() { return connection.initialClients; },
            get initialContents() { return connection.initialContents; },
            get initialMessages() { return connection.initialMessages; },
            get initialSignals() { return connection.initialSignals; },
            maxMessageSize: connection.maxMessageSize,
            mode: connection.mode,
            parentBranch: connection.parentBranch,
            serviceConfiguration: connection.serviceConfiguration,
            version: connection.version,
        };

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

    /**
     * Subscribe to events emitted by the document
     *
     * @param event - event emitted by the document to listen to
     * @param listener - listener for the event
     */
    public on(event: string, listener: (...args: any[]) => void): this {
        // Register for the event on connection

        // A number of events that are pass-through.
        // Note that we delay subscribing to op / op-content / signal on purpose, as
        // that is used as a signal in DocumentDeltaConnection to know if anyone has subscribed
        // to these events, and thus stop accumulating ops / signals in early handlers.
        if (this.forwardEvents.indexOf(event) !== -1) {
            assert(this.connection.listeners(event).length === 0, "re-registration of events is not implemented");
            this.connection.on(
                event,
                (...args: any[]) => {
                    this.emit(event, ...args);
                });
        } else {
            // These are events that we already subscribed to and already emit on object.
            assert(this.nonForwardEvents.indexOf(event) !== -1);
        }

        // And then add the listener to our event emitter
        super.on(event, listener);

        return this;
    }
}
