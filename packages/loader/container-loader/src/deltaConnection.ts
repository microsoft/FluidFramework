/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IConnectionDetails,
} from "@microsoft/fluid-container-definitions";
import {
    IDocumentDeltaConnection,
    IDocumentService,
    IDocumentDeltaConnectionEvents,
} from "@microsoft/fluid-driver-definitions";
import {
    IClient,
    IDocumentMessage,
    INack,
} from "@microsoft/fluid-protocol-definitions";
import { EventForwarder } from "@microsoft/fluid-common-utils";

export class DeltaConnection extends EventForwarder<IDocumentDeltaConnectionEvents> {
    public static async connect(
        service: IDocumentService,
        client: IClient) {
        const connection = await service.connectToDeltaStream(client);
        return new DeltaConnection(connection);
    }

    public get details(): IConnectionDetails {
        return this._details;
    }

    public get nacked(): boolean {
        return this._nacked;
    }

    public get connected(): boolean {
        return !!this._connection;
    }

    private readonly _details: IConnectionDetails;
    private _nacked = false;

    private _connection?: IDocumentDeltaConnection;

    private get connection(): IDocumentDeltaConnection {
        if (!this._connection) {
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
            this.emit("nack", message[0]);
        });

        connection.on("disconnect", (reason) => {
            this.emit("disconnect", reason);
            this.close();
        });

        // A number of events that are pass-through.
        // Note that we delay subscribing to op / op-content / signal on purpose, as
        // that is used as a signal in DocumentDeltaConnection to know if anyone has subscribed
        // to these events, and thus stop accumulating ops / signals in early handlers.
        this.forwardEvent(connection, "op", "op-content", "signal", "error", "pong");
    }

    /**
     * Closes the delta connection. This disconnects the socket and clears any listeners
     */
    public close() {
        if (this._connection) {
            const connection = this._connection;
            this._connection = undefined;
            connection.disconnect();
        }
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
