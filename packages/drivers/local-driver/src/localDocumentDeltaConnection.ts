/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { DocumentDeltaConnection } from "@fluidframework/driver-base";
import { IDocumentDeltaConnection } from "@fluidframework/driver-definitions";
import {
    IClient,
    IConnect,
    IDocumentMessage,
    NackErrorType,
} from "@fluidframework/protocol-definitions";
import { LocalWebSocketServer } from "@fluidframework/server-local-server";
import * as core from "@fluidframework/server-services-core";

const testProtocolVersions = ["^0.3.0", "^0.2.0", "^0.1.0"];
export class LocalDocumentDeltaConnection
    extends DocumentDeltaConnection
    implements IDocumentDeltaConnection {
    public static async create(
        tenantId: string,
        id: string,
        token: string,
        client: IClient,
        webSocketServer: core.IWebSocketServer,
        timeoutMs = 60000,
    ): Promise<LocalDocumentDeltaConnection> {
        const socket = (webSocketServer as LocalWebSocketServer).createConnection();

        // Cast LocalWebSocket to SocketIOClient.Socket which is the socket that the base class needs. This is hacky
        // but should be fine because this delta connection is for local use only.
        const socketWithListener = socket as unknown as SocketIOClient.Socket;

        // Add `off` method the socket which is called by the base class `DocumentDeltaConnection` to remove
        // event listeners.
        // We may have to add more methods from SocketIOClient.Socket if they start getting used.
        socketWithListener.off = (event: string, listener: (...args: any[]) => void) => {
            socketWithListener.removeListener(event, listener);
            return socketWithListener;
        };

        const deltaConnection = new LocalDocumentDeltaConnection(socketWithListener, id);

        const connectMessage: IConnect = {
            client,
            id,
            mode: client.mode,
            tenantId,
            token,  // Token is going to indicate tenant level information, etc...
            versions: testProtocolVersions,
        };
        await deltaConnection.initialize(connectMessage, timeoutMs);
        return deltaConnection;
    }

    constructor(socket: SocketIOClient.Socket, documentId: string) {
          super(socket, documentId, new TelemetryNullLogger());
    }

    /**
     * Submits a new delta operation to the server
     */
    public submit(messages: IDocumentMessage[]): void {
        // We use a promise resolve to force a turn break given message processing is sync
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        Promise.resolve().then(() => {
            this.submitManager.add("submitOp", messages);
            this.submitManager.drain();
        });
    }

    /**
     * Submits a new signal to the server
     */
    public submitSignal(message: any): void {
        this.submitManager.add("submitSignal", message);
        this.submitManager.drain();
    }

    /**
     * Send a "disconnect" message on the socket.
     * @param disconnectReason - The reason of the disconnection.
     */
    public disconnectClient(disconnectReason: string) {
        this.socket.emit("disconnect", disconnectReason);
    }

    /**
     * * Sends a "nack" message on the socket.
     * @param code - An error code number that represents the error. It will be a valid HTTP error code.
     * @param type - Type of the Nack.
     * @param message - A message about the nack for debugging/logging/telemetry purposes.
     */
    public nackClient(code: number = 400, type: NackErrorType = NackErrorType.ThrottlingError, message: any) {
        const nackMessage = {
            operation: undefined,
            sequenceNumber: -1,
            content: {
                code,
                type,
                message,
            },
        };
        this.socket.emit("nack", "", [nackMessage]);
    }
}
