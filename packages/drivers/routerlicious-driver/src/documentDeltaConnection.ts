/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocumentDeltaConnection } from "@fluidframework/driver-base";
import { IDocumentDeltaConnection, DriverError } from "@fluidframework/driver-definitions";
import { IClient, IConnect } from "@fluidframework/protocol-definitions";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { errorObjectFromSocketError } from "./errorUtils";

const protocolVersions = ["^0.4.0", "^0.3.0", "^0.2.0", "^0.1.0"];

/**
 * Wrapper over the shared one for driver specific translation.
 */
export class R11sDocumentDeltaConnection extends DocumentDeltaConnection
{
    public static async create(
        tenantId: string,
        id: string,
        token: string | null,
        io: SocketIOClientStatic,
        client: IClient,
        url: string,
        logger: ITelemetryLogger,
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

        const deltaConnection = new R11sDocumentDeltaConnection(socket, id, logger);

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
            return errorObjectFromSocketError(error, handler) as DriverError;
        } else {
            return super.createErrorObject(handler, error, canRetry);
        }
    }
}
