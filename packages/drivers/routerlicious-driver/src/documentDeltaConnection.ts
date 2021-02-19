/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocumentDeltaConnection } from "@fluidframework/driver-base";
import { IDocumentDeltaConnection, DriverError } from "@fluidframework/driver-definitions";
import { IClient, IConnect } from "@fluidframework/protocol-definitions";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { createR11sNetworkError } from "./r11sError";

const protocolVersions = ["^0.4.0", "^0.3.0", "^0.2.0", "^0.1.0"];

/**
 * Returns specific network error based on error object.
 */
const errorObjectFromSocketError = (socketError: {[key: string]: any}, handler: string, canRetry: boolean) => {
    return createR11sNetworkError(
        `socket.io: ${handler}: ${socketError.message}`,
        socketError.code,
        canRetry,
        socketError.retryAfter);
};

/**
 * Wrapper over the shared one for driver specific translation.
 */
export class R11sDocumentDeltaConnection extends DocumentDeltaConnection implements IDocumentDeltaConnection {
    public static async create(
        tenantId: string,
        id: string,
        token: string | null,
        io: SocketIOClientStatic,
        client: IClient,
        url: string,
        timeoutMs = 20000): Promise<IDocumentDeltaConnection> {
        const socket = io(
            url,
            {
                query: {
                    documentId: id,
                    tenantId,
                },
                reconnection: false,
                transports: ["websocket"],
                timeout: timeoutMs,
            });

        const connectMessage: IConnect = {
            client,
            id,
            mode: client.mode,
            tenantId,
            token,  // Token is going to indicate tenant level information, etc...
            versions: protocolVersions,
        };

        const deltaConnection = new R11sDocumentDeltaConnection(socket, id, new TelemetryNullLogger());

        await deltaConnection.initialize(connectMessage, timeoutMs);
        return deltaConnection;
    }

    /**
     * Error raising for socket.io issues
     */
    protected createErrorObject(handler: string, error?: any, canRetry = true): DriverError {
        // Note: we suspect the incoming error object is either:
        // - a string: log it in the message (if not a string, it may contain PII but will print as [object Object])
        // - a socketError: add it to the OdspError object for driver to be able to parse it and reason
        //   over it.
        if (canRetry && typeof error === "object" && error !== null) {
            return errorObjectFromSocketError(error, handler, canRetry) as DriverError;
        } else {
            return super.createErrorObject(handler, error, canRetry);
        }
    }
}
