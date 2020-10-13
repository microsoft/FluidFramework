/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IConnectionDetails,
} from "@fluidframework/container-definitions";
import {
    IDocumentDeltaConnection,
    IDocumentService,
    IDocumentDeltaConnectionEvents,
} from "@fluidframework/driver-definitions";
import {
    IClient,
    IDocumentMessage,
} from "@fluidframework/protocol-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";

export class DeltaConnection
    extends TypedEventEmitter<IDocumentDeltaConnectionEvents> {
    public static async connect(
        service: IDocumentService,
        client: IClient) {
        const connection = await service.connectToDeltaStream(client);
        return new DeltaConnection(connection);
    }

    public get details(): IConnectionDetails {
        return this._details;
    }

    private readonly _details: IConnectionDetails;

    private _connection?: IDocumentDeltaConnection;

    private get connection(): IDocumentDeltaConnection {
        if (this._connection === undefined) {
            throw new Error("Connection is closed!");
        }
        return this._connection;
    }

    private constructor(connection: IDocumentDeltaConnection) {
        super();
        this._connection = connection;

        this._details = {
            claims: connection.claims,
            clientId: connection.clientId,
            existing: connection.existing,
            checkpointSequenceNumber: connection.checkpointSequenceNumber,
            get initialClients() { return connection.initialClients; },
            get initialMessages() { return connection.initialMessages; },
            get initialSignals() { return connection.initialSignals; },
            maxMessageSize: connection.maxMessageSize,
            mode: connection.mode,
            parentBranch: connection.parentBranch,
            serviceConfiguration: connection.serviceConfiguration,
            version: connection.version,
        };

        this.on("newListener", (event: string, listener: (...args: any[]) => void) => {
            // Register for the event on connection
            // A number of events that are pass-through.
            // Note that we delay subscribing to op / signal on purpose, as
            // that is used as a signal in DocumentDeltaConnection to know if anyone has subscribed
            // to these events, and thus stop accumulating ops / signals in early handlers.
            // See DocumentDeltaConnection.initialMessages() implementation for details.
            if (this.listeners(event).length === 0) {
                this.connection.on(
                    event as any,
                    (...args: any[]) => {
                        this.emit(event, ...args);
                    });
            }
        });
    }

    /**
     * Closes the delta connection. This disconnects the socket and clears any listeners
     */
    public close() {
        if (this._connection !== undefined) {
            const connection = this._connection;
            this._connection = undefined;
            // Avoid re-entrncy - remove all listeners before closing!
            this.removeAllListeners();
            connection.close();
        }
    }

    public submit(messages: IDocumentMessage[]): void {
        this.connection.submit(messages);
    }

    public submitSignal(message: any): void {
        return this.connection.submitSignal(message);
    }
}
