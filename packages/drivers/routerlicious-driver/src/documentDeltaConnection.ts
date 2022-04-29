/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { DocumentDeltaConnection } from "@fluidframework/driver-base";
import { IDocumentDeltaConnection } from "@fluidframework/driver-definitions";
import { IAnyDriverError } from "@fluidframework/driver-utils";
import { IClient, IConnect } from "@fluidframework/protocol-definitions";
import type { io as SocketIOClientStatic } from "socket.io-client";
import { errorObjectFromSocketError, IR11sSocketError } from "./errorUtils";
import { pkgVersion as driverVersion } from "./packageVersion";

const protocolVersions = ["^0.4.0", "^0.3.0", "^0.2.0", "^0.1.0"];

/**
 * Wrapper over the shared one for driver specific translation.
 */
export class R11sDocumentDeltaConnection extends DocumentDeltaConnection {
    public static async create(
        tenantId: string,
        id: string,
        token: string | null,
        io: typeof SocketIOClientStatic,
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
                // Default to websocket connection, with long-polling disabled
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
            relayUserAgent: [client.details.environment, ` driverVersion:${driverVersion}`].join(";"),
        };

        // TODO: expose to host at factory level
        const enableLongPollingDowngrades = true;
        const deltaConnection = new R11sDocumentDeltaConnection(socket, id, logger, enableLongPollingDowngrades);

        await deltaConnection.initialize(connectMessage, timeoutMs);
        return deltaConnection;
    }

    /**
     * Error raising for socket.io issues
     */
    protected createErrorObject(handler: string, error?: any, canRetry = true): IAnyDriverError {
        // Note: we suspect the incoming error object is either:
        // - a socketError: add it to the R11sError object for driver to be able to parse it and reason over it.
        // - anything else: let base class handle it
        if (canRetry && Number.isInteger(error?.code) && typeof error?.message === "string") {
            return errorObjectFromSocketError(error as IR11sSocketError, handler);
        } else {
            return super.createErrorObject(handler, error, canRetry);
        }
    }
}
