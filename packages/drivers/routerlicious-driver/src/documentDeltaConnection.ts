/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { DocumentDeltaConnection } from "@fluidframework/driver-base";
import { IDocumentDeltaConnection } from "@fluidframework/driver-definitions";
import { IAnyDriverError } from "@fluidframework/driver-utils";
import { IClient, IConnect, IDocumentMessage } from "@fluidframework/protocol-definitions";
import type { io as SocketIOClientStatic, Socket } from "socket.io-client";
import { errorObjectFromSocketError, IR11sSocketError } from "./errorUtils";
import { pkgVersion as driverVersion } from "./packageVersion";
const protocolVersions = ["^0.4.0", "^0.3.0", "^0.2.0", "^0.1.0"];
/**
 * Wrapper over the shared one for driver specific translation.
 */

const getRandomInt = (range: number) =>
Math.floor(Math.random() * range);

export class R11sDocumentDeltaConnection extends DocumentDeltaConnection {
    constructor(
        socket: Socket,
        documentId: string,
        logger: ITelemetryLogger,
        enableLongPollingDowngrades: boolean = false,
    ) {
        super(socket, documentId, logger, enableLongPollingDowngrades);
        socket.on("op", (docId, messages) => {
            if (getRandomInt(1000) === 0) {
                const timestamp = Date.now();
                messages.forEach((message) => {
                    // console.log(`OP!! this.clientId=${this.clientId}
                    // and this.details.clientId=${this.details.clientId}
                    // and message.clientId=${message.clientId}`);
                    if (this.details.clientId === message.clientId) {
                        logger.sendTelemetryEvent({
                            eventName: "Driver-Op-Received",
                            category: "generic",
                            timestamp,
                            documentId: docId,
                            clientId: message.clientId,
                            clientSequenceNumber: message.clientSequenceNumber,
                            sequenceNumber: message.sequenceNumber,
                            traces: JSON.stringify(message.traces),
                        });
                    }
                });
            }
        });
    }
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

    protected emitMessages(type: string, messages: IDocumentMessage[][]) {
        super.emitMessages(type, messages);
        if (getRandomInt(100) === 0) {
            if (type === "submitOp") {
                // console.log(`submit Op in driver = ${JSON.stringify(messages)}`);
                const timestamp = Date.now();
                messages.forEach((message) => {
                    message.forEach((msg) => {
                        const opType = JSON.stringify(JSON.parse(msg.contents)?.contents?.contents?.type) ?? msg.type;
                        if (opType === "\"op\"") {
                            //  && getRandomInt(100) === 0) {
                            // console.log(`ksmessage-submitop; clientId=
                            // ${this.details.clientId} and ${this.clientId}`);
                            this.logger.sendTelemetryEvent({
                                eventName: "Driver-SubmitOp-Emit",
                                category: "generic",
                                timestamp,
                                documentId: this.documentId,
                                clientId: this.clientId,
                                clientSequenceNumber: msg.clientSequenceNumber,
                                sequenceNumber: -1,
                                traces: JSON.stringify(msg.traces),
                                content: JSON.stringify(msg),
                            });
                        }
                    });
                });
            }
        }
    }

    /**
     * Error raising for socket.io issues
     */
    protected createErrorObject(handler: string, error?: any, canRetry = true): IAnyDriverError {
        // Note: we suspect the incoming error object is either:
        // - a socketError: add it to the R11sError object for driver to be able to parse it and reason over it.
        // - anything else: let base class handle it
        return canRetry && Number.isInteger(error?.code) && typeof error?.message === "string"
            ? errorObjectFromSocketError(error as IR11sSocketError, handler)
            : super.createErrorObject(handler, error, canRetry);
    }
}
