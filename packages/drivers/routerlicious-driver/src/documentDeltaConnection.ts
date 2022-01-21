/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocumentDeltaConnection } from "@fluidframework/driver-base";
import { IDocumentDeltaConnection, DriverError } from "@fluidframework/driver-definitions";
import { IClient, IConnect } from "@fluidframework/protocol-definitions";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { errorObjectFromSocketError, IR11sSocketError } from "./errorUtils";

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
                // Allow 1 reconnection attempt so that polling can be tried
                reconnection: true,
                reconnectionAttempts: 1,
                // Enable long-polling as a downgrade option
                transports: ["websocket", "polling"],
                timeout: timeoutMs,
            });
        socket.on("connect_error", () => {
            // Fallback to polling upgrade mechanism on connection failure
            socket.io.opts.transports = ["polling", "websocket"];
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
        // - a socketError: add it to the OdspError object for driver to be able to parse it and reason over it.
        // - anything else: let base class handle it
        if (canRetry && Number.isInteger(error?.code) && typeof error?.message === "string") {
            return errorObjectFromSocketError(error as IR11sSocketError, handler) as DriverError;
        } else {
            return super.createErrorObject(handler, error, canRetry);
        }
    }
}
