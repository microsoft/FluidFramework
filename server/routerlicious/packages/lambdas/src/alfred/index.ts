/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ConnectionMode,
    IClient,
    IConnect,
    IConnected,
    IDocumentMessage,
    INack,
    ISignalMessage,
    NackErrorType,
    ScopeType,
} from "@fluidframework/protocol-definitions";
import {
    canSummarize,
    canWrite,
    isNetworkError,
    NetworkError,
    validateTokenClaims,
    validateTokenClaimsExpiration,
} from "@fluidframework/server-services-client";

import safeStringify from "json-stringify-safe";
import * as semver from "semver";
import * as core from "@fluidframework/server-services-core";
import {
    BaseTelemetryProperties,
    CommonProperties,
    LumberEventName,
    Lumberjack,
    getLumberBaseProperties,
} from "@fluidframework/server-services-telemetry";
import {
    createRoomJoinMessage,
    createNackMessage,
    createRoomLeaveMessage,
    generateClientId,
    getRandomInt,
} from "../utils";

const summarizerClientType = "summarizer";

interface IRoom {

    tenantId: string;

    documentId: string;
}

interface IConnectedClient {

    connection: IConnected;

    details: IClient;

    connectVersions: string[];
}

function getRoomId(room: IRoom) {
    return `${room.tenantId}/${room.documentId}`;
}

const getMessageMetadata = (documentId: string, tenantId: string) => ({
    documentId,
    tenantId,
});

const handleServerError = async (logger: core.ILogger, errorMessage: string, documentId: string, tenantId: string) => {
    logger.error(errorMessage, { messageMetaData: getMessageMetadata(documentId, tenantId) });
    Lumberjack.error(errorMessage, getLumberBaseProperties(documentId, tenantId));
    throw new NetworkError(500, "Failed to connect client to document.");
};

const getSocketConnectThrottleId = (tenantId: string) => `${tenantId}_OpenSocketConn`;

const getSubmitOpThrottleId = (clientId: string, tenantId: string) => `${clientId}_${tenantId}_SubmitOp`;

const getSubmitSignalThrottleId = (clientId: string, tenantId: string) => `${clientId}_${tenantId}_SubmitSignal`;

// Sanitize the received op before sending.
function sanitizeMessage(message: any): IDocumentMessage {
    const sanitizedMessage: IDocumentMessage = {
        clientSequenceNumber: message.clientSequenceNumber,
        contents: message.contents,
        metadata: message.metadata,
        referenceSequenceNumber: message.referenceSequenceNumber,
        traces: message.traces,
        type: message.type,
        compression: message.compression,
    // back-compat ADO #1932: Remove cast when protocol change propagates
    } as any;

    return sanitizedMessage;
}

const protocolVersions = ["^0.4.0", "^0.3.0", "^0.2.0", "^0.1.0"];

function selectProtocolVersion(connectVersions: string[]): string | undefined {
    for (const connectVersion of connectVersions) {
        for (const protocolVersion of protocolVersions) {
            if (semver.intersects(protocolVersion, connectVersion)) {
                return protocolVersion;
            }
        }
    }
}

/**
 * Converts a relayUserAgent string into a \<key,value\> map.
 * @param relayUserAgent - user agent string in the format "prop1:val1;prop2:val2;prop3:val3"
 */
function parseRelayUserAgent(relayUserAgent: string | undefined): Record<string, string> {
    if (!relayUserAgent) {
        return {};
    }
    const map = {};
    const propertyKeyValuePairs: string[][] = relayUserAgent.split(";").map((keyValuePair) => keyValuePair.split(":"));
    // TODO: would be cleaner with `Object.fromEntries()` but tsconfig needs es2019 lib
    for (const [key, value] of propertyKeyValuePairs) {
        map[key] = value;
    }
    return map;
}

/**
 * Stores client connectivity time in a Redis list.
 */
async function storeClientConnectivityTime(
    clientId: string,
    documentId: string,
    tenantId: string,
    connectionTimestamp: number,
    throttleAndUsageStorageManager: core.IThrottleAndUsageStorageManager) {
    try {
        const now = Date.now();
        const connectionTimeInMinutes = (now - connectionTimestamp) / 60000;
        const storageId = core.clientConnectivityStorageId;
        const usageData = {
            value: connectionTimeInMinutes,
            tenantId,
            documentId,
            clientId,
            startTime: connectionTimestamp,
            endTime: now,
        };
        await throttleAndUsageStorageManager.setUsageData(storageId, usageData);
    } catch (error) {
        Lumberjack.error(`ClientConnectivity data storage failed`, {
            [CommonProperties.clientId]: clientId,
            [BaseTelemetryProperties.tenantId]: tenantId,
            [BaseTelemetryProperties.documentId]: documentId,
        },
            error);
    }
}

/**
 * @returns ThrottlingError if throttled; undefined if not throttled or no throttler provided.
 */
function checkThrottleAndUsage(
    throttler: core.IThrottler | undefined,
    throttleId: string,
    tenantId: string,
    logger?: core.ILogger,
    usageStorageId?: string,
    usageData?: core.IUsageData): core.ThrottlingError | undefined {
    if (!throttler) {
        return;
    }

    try {
        throttler.incrementCount(throttleId, 1, usageStorageId, usageData);
    } catch (error) {
        if (error instanceof core.ThrottlingError) {
            return error;
        } else {
            logger?.error(
                `Throttle increment failed: ${safeStringify(error, undefined, 2)}`,
                {
                    messageMetaData: {
                        key: throttleId,
                        eventName: "throttling",
                    },
                });
            Lumberjack.error(`Throttle increment failed`, {
                [CommonProperties.telemetryGroupName]: "throttling",
                [BaseTelemetryProperties.tenantId]: tenantId,
            }, error);
        }
    }
}

export function configureWebSocketServices(
    webSocketServer: core.IWebSocketServer,
    orderManager: core.IOrdererManager,
    tenantManager: core.ITenantManager,
    storage: core.IDocumentStorage,
    clientManager: core.IClientManager,
    metricLogger: core.IMetricClient,
    logger: core.ILogger,
    maxNumberOfClientsPerDocument: number = 1000000,
    numberOfMessagesPerTrace: number = 100,
    maxTokenLifetimeSec: number = 60 * 60,
    isTokenExpiryEnabled: boolean = false,
    isClientConnectivityCountingEnabled: boolean = false,
    isSignalUsageCountingEnabled: boolean = false,
    connectThrottler?: core.IThrottler,
    submitOpThrottler?: core.IThrottler,
    submitSignalThrottler?: core.IThrottler,
    throttleAndUsageStorageManager?: core.IThrottleAndUsageStorageManager,
    verifyMaxMessageSize?: boolean,
) {
    webSocketServer.on("connection", (socket: core.IWebSocket) => {
        // Map from client IDs on this connection to the object ID and user info.
        const connectionsMap = new Map<string, core.IOrdererConnection>();
        // Map from client IDs to room.
        const roomMap = new Map<string, IRoom>();
        // Map from client Ids to scope.
        const scopeMap = new Map<string, string[]>();
        // Map from client Ids to connection time.
        const connectionTimeMap = new Map<string, number>();

        // Timer to check token expiry for this socket connection
        let expirationTimer: NodeJS.Timer | undefined;

        const hasWriteAccess = (scopes: string[]) => canWrite(scopes) || canSummarize(scopes);

        function isWriter(scopes: string[], mode: ConnectionMode): boolean {
            return hasWriteAccess(scopes) ? mode === "write" : false;
        }

        function clearExpirationTimer() {
            if (expirationTimer !== undefined) {
                clearTimeout(expirationTimer);
                expirationTimer = undefined;
            }
        }

        function setExpirationTimer(mSecUntilExpiration: number) {
            clearExpirationTimer();
            expirationTimer = setTimeout(() => {
                socket.disconnect(true);
            }, mSecUntilExpiration);
        }

        async function connectDocument(message: IConnect): Promise<IConnectedClient> {
            const throttleError = checkThrottleAndUsage(
                connectThrottler,
                getSocketConnectThrottleId(message.tenantId),
                message.tenantId,
                logger);
            if (throttleError) {
                return Promise.reject(throttleError);
            }
            if (!message.token) {
                throw new NetworkError(403, "Must provide an authorization token");
            }

            // Validate token signature and claims
            const token = message.token;
            const claims = validateTokenClaims(token,
                message.id,
                message.tenantId);

            try {
                await tenantManager.verifyToken(claims.tenantId, token);
            } catch (error) {
                if (isNetworkError(error)) {
                    throw error;
                }
                // We don't understand the error, so it is likely an internal service error.
                const errMsg = `Could not verify connect document token. Error: ${safeStringify(error, undefined, 2)}`;
                return handleServerError(logger, errMsg, claims.tenantId, claims.documentId);
            }

            const clientId = generateClientId();
            const room: IRoom = {
                tenantId: claims.tenantId,
                documentId: claims.documentId,
            };

            try {
                // Subscribe to channels.
                await Promise.all([
                    socket.join(getRoomId(room)),
                    socket.join(`client#${clientId}`)]);
            } catch (err) {
                const errMsg = `Could not subscribe to channels. Error: ${safeStringify(err, undefined, 2)}`;
                return handleServerError(logger, errMsg, claims.documentId, claims.tenantId);
            }

            const connectedTimestamp = Date.now();

            // Todo: should all the client details come from the claims???
            // we are still trusting the users permissions and type here.
            const messageClient: Partial<IClient> = message.client ? message.client : {};
            const isSummarizer = messageClient.details?.type === summarizerClientType;
            messageClient.user = claims.user;
            messageClient.scopes = claims.scopes;

            // 1. Do not give SummaryWrite scope to clients that are not summarizers.
            // 2. Store connection timestamp for all clients but the summarizer.
            // Connection timestamp is used (inside socket disconnect event) to
            // calculate the client connection time (i.e. for billing).
            if (!isSummarizer) {
                messageClient.scopes = claims.scopes.filter((scope) => scope !== ScopeType.SummaryWrite);
                connectionTimeMap.set(clientId, connectedTimestamp);
            }

            // back-compat: remove cast to any once new definition of IClient comes through.
            (messageClient as any).timestamp = connectedTimestamp;

            // Cache the scopes.
            scopeMap.set(clientId, messageClient.scopes);

            // Join the room to receive signals.
            roomMap.set(clientId, room);
            // Iterate over the version ranges provided by the client and select the best one that works
            const connectVersions = message.versions ? message.versions : ["^0.1.0"];
            const version = selectProtocolVersion(connectVersions);
            if (!version) {
                throw new NetworkError(
                    400,
                    // eslint-disable-next-line max-len
                    `Unsupported client protocol. Server: ${protocolVersions}. Client: ${JSON.stringify(connectVersions)}`,
                );
            }

            const clients = await clientManager.getClients(claims.tenantId, claims.documentId)
                .catch(async (err) => {
                    const errMsg = `Failed to get clients. Error: ${safeStringify(err, undefined, 2)}`;
                    return handleServerError(logger, errMsg, claims.documentId, claims.tenantId);
                });

            if (clients.length > maxNumberOfClientsPerDocument) {
                throw new NetworkError(
                    429,
                    "Too Many Clients Connected to Document",
                    true, /* canRetry */
                    false, /* isFatal */
                    5 * 60 * 1000 /* retryAfterMs (5 min) */,
                );
            }

            try {
                await clientManager.addClient(
                    claims.tenantId,
                    claims.documentId,
                    clientId,
                    messageClient as IClient);
            } catch (err) {
                const errMsg = `Could not add client. Error: ${safeStringify(err, undefined, 2)}`;
                return handleServerError(logger, errMsg, claims.documentId, claims.tenantId);
            }

            if (isTokenExpiryEnabled) {
                const lifeTimeMSec = validateTokenClaimsExpiration(claims, maxTokenLifetimeSec);
                setExpirationTimer(lifeTimeMSec);
            }

            let connectedMessage: IConnected;
            if (isWriter(messageClient.scopes, message.mode)) {
                const orderer = await orderManager.getOrderer(claims.tenantId, claims.documentId)
                    .catch(async (err) => {
                        const errMsg = `Failed to get orderer manager. Error: ${safeStringify(err, undefined, 2)}`;
                        return handleServerError(logger, errMsg, claims.documentId, claims.tenantId);
                    });

                const connection = await orderer.connect(socket, clientId, messageClient as IClient)
                    .catch(async (err) => {
                        const errMsg = `Failed to connect to orderer. Error: ${safeStringify(err, undefined, 2)}`;
                        return handleServerError(logger, errMsg, claims.documentId, claims.tenantId);
                    });

                // Eventually we will send disconnect reason as headers to client.
                connection.once("error", (error) => {
                    const messageMetaData = getMessageMetadata(connection.documentId, connection.tenantId);

                    // eslint-disable-next-line max-len
                    logger.error(`Disconnecting socket on connection error: ${safeStringify(error, undefined, 2)}`, { messageMetaData });
                    Lumberjack.error(
                        `Disconnecting socket on connection error`,
                        getLumberBaseProperties(connection.documentId, connection.tenantId),
                        error,
                    );
                    clearExpirationTimer();
                    socket.disconnect(true);
                });

                connection.connect()
                    .catch(async (err) => {
                        // eslint-disable-next-line max-len
                        const errMsg = `Failed to connect to the orderer connection. Error: ${safeStringify(err, undefined, 2)}`;
                        return handleServerError(logger, errMsg, claims.documentId, claims.tenantId);
                    });

                connectionsMap.set(clientId, connection);

                connectedMessage = {
                    claims,
                    clientId,
                    existing: true,
                    maxMessageSize: connection.maxMessageSize,
                    mode: "write",
                    serviceConfiguration: {
                        blockSize: connection.serviceConfiguration.blockSize,
                        maxMessageSize: connection.serviceConfiguration.maxMessageSize,
                    },
                    initialClients: clients,
                    initialMessages: [],
                    initialSignals: [],
                    supportedVersions: protocolVersions,
                    version,
                };
            } else {
                connectedMessage = {
                    claims,
                    clientId,
                    existing: true,
                    maxMessageSize: 1024, // Readonly client can't send ops.
                    mode: "read",
                    serviceConfiguration: {
                        blockSize: core.DefaultServiceConfiguration.blockSize,
                        maxMessageSize: core.DefaultServiceConfiguration.maxMessageSize,
                    },
                    initialClients: clients,
                    initialMessages: [],
                    initialSignals: [],
                    supportedVersions: protocolVersions,
                    version,
                };
            }

            // back-compat: remove cast to any once new definition of IConnected comes through.
            (connectedMessage as any).timestamp = connectedTimestamp;

            return {
                connection: connectedMessage,
                connectVersions,
                details: messageClient as IClient,
            };
        }

        // Note connect is a reserved socket.io word so we use connect_document to represent the connect request
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        socket.on("connect_document", async (connectionMessage: IConnect) => {
            const userAgentInfo = parseRelayUserAgent(connectionMessage.relayUserAgent);
            const driverVersion: string | undefined = userAgentInfo.driverVersion;
            const connectMetric = Lumberjack.newLumberMetric(LumberEventName.ConnectDocument);
            connectMetric.setProperties({
                ...getLumberBaseProperties(connectionMessage.id, connectionMessage.tenantId),
                [CommonProperties.clientDriverVersion]: driverVersion,
            });

            connectDocument(connectionMessage).then(
                (message) => {
                    socket.emit("connect_document_success", message.connection);
                    const room = roomMap.get(message.connection.clientId);
                    if (room) {
                        socket.emitToRoom(
                            getRoomId(room),
                            "signal",
                            createRoomJoinMessage(message.connection.clientId, message.details));
                    }

                    connectMetric.setProperties({
                        [CommonProperties.clientId]: message.connection.clientId,
                        [CommonProperties.clientCount]: message.connection.initialClients.length + 1,
                        [CommonProperties.clientType]: message.details.details?.type,
                    });
                    connectMetric.success(`Connect document successful`);
                },
                (error) => {
                    socket.emit("connect_document_error", error);
                    connectMetric.error(`Connect document failed`, error);
                });
        });

        // Message sent when a new operation is submitted to the router
        socket.on(
            "submitOp",
            (clientId: string, messageBatches: (IDocumentMessage | IDocumentMessage[])[]) => {
                // Verify the user has an orderer connection.
                const connection = connectionsMap.get(clientId);
                if (!connection) {
                    let nackMessage: INack;
                    const clientScope = scopeMap.get(clientId);
                    if (clientScope && hasWriteAccess(clientScope)) {
                        nackMessage = createNackMessage(400, NackErrorType.BadRequestError, "Readonly client");
                    } else if (roomMap.has(clientId)) {
                        nackMessage = createNackMessage(403, NackErrorType.InvalidScopeError, "Invalid scope");
                    } else {
                        nackMessage = createNackMessage(400, NackErrorType.BadRequestError, "Nonexistent client");
                    }

                    socket.emit("nack", "", [nackMessage]);
                } else {
                    const throttleError = checkThrottleAndUsage(
                        submitOpThrottler,
                        getSubmitOpThrottleId(clientId, connection.tenantId),
                        connection.tenantId,
                        logger);
                    if (throttleError) {
                        const nackMessage = createNackMessage(
                            throttleError.code,
                            NackErrorType.ThrottlingError,
                            throttleError.message,
                            throttleError.retryAfter);
                        socket.emit("nack", "", [nackMessage]);
                        return;
                    }

                    const lumberjackProperties = {
                        [CommonProperties.clientId]: clientId,
                        ...getLumberBaseProperties(connection.documentId, connection.tenantId),
                    };
                    const handleMessageBatchProcessingError = (error: any) => {
                        if (isNetworkError(error)) {
                            if (error.code === 413) {
                                Lumberjack.info("Rejected too large operation(s)", lumberjackProperties);
                                socket.emit("nack", "", [createNackMessage(
                                    error.code,
                                    NackErrorType.BadRequestError,
                                    error.message,
                                )]);
                                return;
                            }
                        }
                        Lumberjack.error("Error processing submitted op(s)", lumberjackProperties, error);
                    };
                    messageBatches.forEach((messageBatch) => {
                        const messages = Array.isArray(messageBatch) ? messageBatch : [messageBatch];
                        try {
                            const sanitized = messages
                                .filter((message) => {
                                    if (verifyMaxMessageSize === true) {
                                        // Local tests show `JSON.stringify` to be fast
                                        // - <1ms for JSONs <100kb
                                        // - ~2ms for JSONs ~256kb
                                        // - ~6ms for JSONs ~1mb
                                        // - ~38ms for JSONs ~10mb
                                        // - ~344ms for JSONs ~100mb
                                        // maxMessageSize is currently 16kb, so this check should be <1ms
                                        const messageSize = JSON.stringify(message.contents).length;
                                        const maxMessageSize = connection.serviceConfiguration.maxMessageSize;
                                        if (messageSize > maxMessageSize) {
                                            // Exit early from processing message batch
                                            throw new NetworkError(413, "Op size too large");
                                        }
                                    }

                                    return true;
                                })
                              .map((message) => {
                                  const sanitizedMessage: IDocumentMessage = sanitizeMessage(message);
                                  const sanitizedMessageWithTrace = addAlfredTrace(sanitizedMessage,
                                      numberOfMessagesPerTrace, connection.clientId,
                                      connection.tenantId, connection.documentId);
                                  return sanitizedMessageWithTrace;
                              });

                            if (sanitized.length > 0) {
                                // Cannot await this order call without delaying other message batches in this submitOp.
                                connection.order(sanitized).catch(handleMessageBatchProcessingError);
                            }
                        } catch (e) {
                            handleMessageBatchProcessingError(e);
                        }
                    });
                }
            });

        // Message sent when a new signal is submitted to the router
        socket.on(
            "submitSignal",
            (clientId: string, contentBatches: (IDocumentMessage | IDocumentMessage[])[]) => {
                // Verify the user has subscription to the room.
                const room = roomMap.get(clientId);
                if (!room) {
                    const nackMessage = createNackMessage(400, NackErrorType.BadRequestError, "Nonexistent client");
                    socket.emit("nack", "", [nackMessage]);
                } else {
                    const signalUsageData: core.IUsageData = {
                        value: 0,
                        tenantId: room.tenantId,
                        documentId: room.documentId,
                        clientId,
                    };
                    const throttleError = checkThrottleAndUsage(
                        submitSignalThrottler,
                        getSubmitSignalThrottleId(clientId, room.tenantId),
                        room.tenantId,
                        logger,
                        isSignalUsageCountingEnabled ? core.signalUsageStorageId : undefined,
                        isSignalUsageCountingEnabled ? signalUsageData : undefined);
                    if (throttleError) {
                        const nackMessage = createNackMessage(
                            throttleError.code,
                            NackErrorType.ThrottlingError,
                            throttleError.message,
                            throttleError.retryAfter);
                        socket.emit("nack", "", [nackMessage]);
                        return;
                    }
                    contentBatches.forEach((contentBatche) => {
                        const contents = Array.isArray(contentBatche) ? contentBatche : [contentBatche];

                        for (const content of contents) {
                            const signalMessage: ISignalMessage = {
                                clientId,
                                content,
                            };

                            socket.emitToRoom(getRoomId(room), "signal", signalMessage);
                        }
                    });
                }
            });

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        socket.on("disconnect", async () => {
            clearExpirationTimer();
            const removeAndStoreP: Promise<void>[] = [];
            // Send notification messages for all client IDs in the connection map
            for (const [clientId, connection] of connectionsMap) {
                const messageMetaData = getMessageMetadata(connection.documentId, connection.tenantId);
                logger.info(`Disconnect of ${clientId}`, { messageMetaData });
                Lumberjack.info(
                    `Disconnect of ${clientId}`,
                    getLumberBaseProperties(connection.documentId, connection.tenantId),
                );
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                connection.disconnect();
                if (isClientConnectivityCountingEnabled && throttleAndUsageStorageManager) {
                    const connectionTimestamp = connectionTimeMap.get(clientId);
                    if (connectionTimestamp) {
                        removeAndStoreP.push(storeClientConnectivityTime(
                            clientId,
                            connection.documentId,
                            connection.tenantId,
                            connectionTimestamp,
                            throttleAndUsageStorageManager,
                        ));
                    }
                }
            }
            // Send notification messages for all client IDs in the room map
            for (const [clientId, room] of roomMap) {
                const messageMetaData = getMessageMetadata(room.documentId, room.tenantId);
                logger.info(`Disconnect of ${clientId} from room`, { messageMetaData });
                Lumberjack.info(
                    `Disconnect of ${clientId} from room`,
                    getLumberBaseProperties(room.documentId, room.tenantId),
                );
                removeAndStoreP.push(clientManager.removeClient(room.tenantId, room.documentId, clientId));
                socket.emitToRoom(getRoomId(room), "signal", createRoomLeaveMessage(clientId));
            }
            await Promise.all(removeAndStoreP);
        });
    });
}

function addAlfredTrace(message: IDocumentMessage, numberOfMessagesPerTrace: number,
    clientId: string, tenantId: string, documentId: string) {
    if (message && core.DefaultServiceConfiguration.enableTraces && sampleMessages(numberOfMessagesPerTrace)) {
        if (message.traces === undefined) {
            message.traces = [];
        }
        message.traces.push(
        {
            action: "start",
            service: "alfred",
            timestamp: Date.now(),
        });

        const lumberjackProperties = {
            [BaseTelemetryProperties.tenantId]: tenantId,
            [BaseTelemetryProperties.documentId]: documentId,
            clientId,
            clientSequenceNumber: message.clientSequenceNumber,
            traces: message.traces,
            opType: message.type,
        };
        Lumberjack.info(`Message received by Alfred.`, lumberjackProperties);
    }

    return message;
}

function sampleMessages(numberOfMessagesPerTrace: number): boolean {
    return getRandomInt(numberOfMessagesPerTrace) === 0;
}
