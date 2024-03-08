/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
	IConnect,
	IDocumentMessage,
	INack,
	ISignalMessage,
	NackErrorType,
} from "@fluidframework/protocol-definitions";
import { isNetworkError, NetworkError } from "@fluidframework/server-services-client";
import { v4 as uuid } from "uuid";
import * as core from "@fluidframework/server-services-core";
import {
	BaseTelemetryProperties,
	CommonProperties,
	LumberEventName,
	Lumberjack,
	getGlobalTelemetryContext,
	getLumberBaseProperties,
} from "@fluidframework/server-services-telemetry";
import { createNackMessage } from "../utils";
import {
	ICollaborationSessionEvents,
	IRoom,
	type INexusLambdaSettings,
	type INexusLambdaConnection,
} from "./interfaces";
import { ExpirationTimer, getRoomId, hasWriteAccess } from "./utils";
import {
	checkThrottleAndUsage,
	getSubmitOpThrottleId,
	getSubmitSignalThrottleId,
} from "./throttleAndUsage";
import { addNexusMessageTrace } from "./trace";
import { connectDocument } from "./connect";
import { disconnectDocument } from "./disconnect";

export { IBroadcastSignalEventPayload, ICollaborationSessionEvents, IRoom } from "./interfaces";

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
	};

	return sanitizedMessage;
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
	const propertyKeyValuePairs: string[][] = relayUserAgent
		.split(";")
		.map((keyValuePair) => keyValuePair.split(":"));
	// TODO: would be cleaner with `Object.fromEntries()` but tsconfig needs es2019 lib
	for (const [key, value] of propertyKeyValuePairs) {
		map[key] = value;
	}
	return map;
}

/**
 * @internal
 */
export function configureWebSocketServices(
	webSocketServer: core.IWebSocketServer,
	ordererManager: core.IOrdererManager,
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
	cache?: core.ICache,
	connectThrottlerPerTenant?: core.IThrottler,
	connectThrottlerPerCluster?: core.IThrottler,
	submitOpThrottler?: core.IThrottler,
	submitSignalThrottler?: core.IThrottler,
	throttleAndUsageStorageManager?: core.IThrottleAndUsageStorageManager,
	verifyMaxMessageSize?: boolean,
	socketTracker?: core.IWebSocketTracker,
	revokedTokenChecker?: core.IRevokedTokenChecker,
	collaborationSessionEventEmitter?: TypedEventEmitter<ICollaborationSessionEvents>,
	clusterDrainingChecker?: core.IClusterDrainingChecker,
) {
	const lambdaSettings: INexusLambdaSettings = {
		ordererManager,
		tenantManager,
		clientManager,
		logger,
		maxTokenLifetimeSec,
		isTokenExpiryEnabled,
		isClientConnectivityCountingEnabled,
		maxNumberOfClientsPerDocument,
		numberOfMessagesPerTrace,
		throttleAndUsageStorageManager,
		throttlers: {
			connectionsPerTenant: connectThrottlerPerTenant,
			connectionsPerCluster: connectThrottlerPerCluster,
			submitOps: submitOpThrottler,
			submitSignals: submitSignalThrottler,
		},
		socketTracker,
		revokedTokenChecker,
		clusterDrainingChecker,
		collaborationSessionEventEmitter,
	};
	webSocketServer.on("connection", (socket: core.IWebSocket) => {
		// Timer to check token expiry for this socket connection
		const expirationTimer = new ExpirationTimer(() => socket.disconnect(true));
		// Map from client IDs on this connection to the object ID and user info.
		const connectionsMap = new Map<string, core.IOrdererConnection>();
		// Map from client IDs to room.
		const roomMap = new Map<string, IRoom>();
		// Map from client Ids to scope.
		const scopeMap = new Map<string, string[]>();
		// Map from client Ids to connection time.
		const connectionTimeMap = new Map<string, number>();
		// Set of client Ids that have been disconnected from orderer.
		const disconnectedOrdererConnections = new Set<string>();
		// Set of client Ids that have been disconnected from room and client manager.
		const disconnectedClients = new Set<string>();

		const lambdaConnection: INexusLambdaConnection = {
			connectionsMap,
			roomMap,
			scopeMap,
			connectionTimeMap,
			expirationTimer,
			disconnectedOrdererConnections,
			disconnectedClients,
		};

		let connectDocumentComplete: boolean = false;
		let connectDocumentP: Promise<void> | undefined;
		let disconnectDocumentP: Promise<void> | undefined;

		// Note connect is a reserved socket.io word so we use connect_document to represent the connect request
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		socket.on("connect_document", async (connectionMessage: IConnect) => {
			const userAgentInfo = parseRelayUserAgent(connectionMessage.relayUserAgent);
			const driverVersion: string | undefined = userAgentInfo.driverVersion;
			const baseLumberjackProperties = getLumberBaseProperties(
				connectionMessage.id,
				connectionMessage.tenantId,
			);
			const correlationId = uuid();
			const properties = {
				...baseLumberjackProperties,
				[CommonProperties.clientDriverVersion]: driverVersion,
				[CommonProperties.connectionCount]: connectionsMap.size,
				[CommonProperties.connectionClients]: JSON.stringify(
					Array.from(connectionsMap.keys()),
				),
				[CommonProperties.roomClients]: JSON.stringify(Array.from(roomMap.keys())),
				[BaseTelemetryProperties.correlationId]: correlationId,
			};

			connectDocumentP = getGlobalTelemetryContext().bindPropertiesAsync(
				{ correlationId, ...baseLumberjackProperties },
				async () =>
					connectDocument(
						socket,
						lambdaSettings,
						lambdaConnection,
						connectionMessage,
						properties,
					)
						.then((message) => {
							socket.emit("connect_document_success", message.connection);
						})
						.catch((error) => {
							socket.emit("connect_document_error", error);
							expirationTimer.clear();
						})
						.finally(() => {
							connectDocumentComplete = true;
							if (disconnectDocumentP) {
								Lumberjack.warning(
									`ConnectDocument completed after disconnect was handled.`,
								);
								// We have already received disconnect for this connection.
								disconnectDocumentP
									.catch((error) => {
										Lumberjack.error(
											"Error encountered in disconnectDocumentP",
											{ ...baseLumberjackProperties },
											error,
										);
									})
									.finally(() => {
										// We might need to re-run disconnect handler after previous disconnect handler completes.
										// DisconnectDocument internally handles the cases where we have already run disconnect for
										// roomsMap and connectionsMap so that we don't duplicate disconnect efforts.
										// The primary need for this retry is when we receive "disconnect" in the narrow window after
										// "connect_document" but before "connectDocumentP" is defined.
										const alreadyDisconnectedAllConnections: boolean =
											connectionsMap.size ===
											disconnectedOrdererConnections.size;
										const alreadyDisconnectedAllClients: boolean =
											roomMap.size === disconnectedClients.size;
										if (
											alreadyDisconnectedAllConnections &&
											alreadyDisconnectedAllClients
										) {
											// Don't retry disconnect if all connections and clients are already handled.
											return;
										}

										const disconnectRetryMetric = Lumberjack.newLumberMetric(
											LumberEventName.DisconnectDocumentRetry,
										);
										disconnectRetryMetric.setProperties({
											...baseLumberjackProperties,
											[CommonProperties.connectionCount]: connectionsMap.size,
											[CommonProperties.connectionClients]: JSON.stringify(
												Array.from(connectionsMap.keys()),
											),
											[CommonProperties.roomClients]: JSON.stringify(
												Array.from(roomMap.keys()),
											),
										});

										disconnectDocument(socket, lambdaSettings, lambdaConnection)
											.then(() => {
												disconnectRetryMetric.success(
													`Successfully retried disconnect.`,
												);
											})
											.catch((error) => {
												disconnectRetryMetric.error(
													`Disconnect retry failed.`,
													error,
												);
											});
									});
							}
						}),
			);
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
						nackMessage = createNackMessage(
							400,
							NackErrorType.BadRequestError,
							"Readonly client",
						);
					} else if (roomMap.has(clientId)) {
						nackMessage = createNackMessage(
							403,
							NackErrorType.InvalidScopeError,
							"Invalid scope",
						);
					} else {
						nackMessage = createNackMessage(
							400,
							NackErrorType.BadRequestError,
							"Nonexistent client",
						);
					}

					socket.emit("nack", "", [nackMessage]);
				} else {
					let messageCount = 0;
					for (const messageBatch of messageBatches) {
						// Count all messages in each batch for accurate throttling calculation.
						// Note: This is happening before message size checking. We won't process
						// messages that are too large, so it is inaccurate to increment throttle
						// counts for unprocessed messages.
						messageCount += Array.isArray(messageBatch) ? messageBatch.length : 1;
					}
					const throttleError = checkThrottleAndUsage(
						submitOpThrottler,
						getSubmitOpThrottleId(clientId, connection.tenantId),
						connection.tenantId,
						logger,
						undefined,
						undefined,
						messageCount /* incrementWeight */,
					);
					if (throttleError) {
						const nackMessage = createNackMessage(
							throttleError.code,
							NackErrorType.ThrottlingError,
							throttleError.message,
							throttleError.retryAfter,
						);
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
								Lumberjack.info(
									"Rejected too large operation(s)",
									lumberjackProperties,
								);
								socket.emit("nack", "", [
									createNackMessage(
										error.code,
										NackErrorType.BadRequestError,
										error.message,
									),
								]);
								return;
							}
						}
						Lumberjack.error(
							"Error processing submitted op(s)",
							lumberjackProperties,
							error,
						);
					};
					messageBatches.forEach((messageBatch) => {
						const messages = Array.isArray(messageBatch)
							? messageBatch
							: [messageBatch];
						try {
							const sanitized = messages.map((message) => {
								if (verifyMaxMessageSize === true) {
									// Local tests show `JSON.stringify` to be fast
									// - <1ms for JSONs <100kb
									// - ~2ms for JSONs ~256kb
									// - ~6ms for JSONs ~1mb
									// - ~38ms for JSONs ~10mb
									// - ~344ms for JSONs ~100mb
									// maxMessageSize is currently 16kb, so this check should be <1ms
									const messageSize = JSON.stringify(message.contents).length;
									const maxMessageSize =
										connection.serviceConfiguration.maxMessageSize;
									if (messageSize > maxMessageSize) {
										// Exit early from processing message batch
										throw new NetworkError(413, "Op size too large");
									}
								}

								const sanitizedMessage: IDocumentMessage = sanitizeMessage(message);
								const sanitizedMessageWithTrace = addNexusMessageTrace(
									sanitizedMessage,
									numberOfMessagesPerTrace,
									connection.clientId,
									connection.tenantId,
									connection.documentId,
								);
								return sanitizedMessageWithTrace;
							});

							if (sanitized.length > 0) {
								// Cannot await this order call without delaying other message batches in this submitOp.
								connection
									.order(sanitized)
									.catch(handleMessageBatchProcessingError);
							}
						} catch (e) {
							handleMessageBatchProcessingError(e);
						}
					});
				}
			},
		);

		// Message sent when a new signal is submitted to the router
		socket.on(
			"submitSignal",
			(clientId: string, contentBatches: (IDocumentMessage | IDocumentMessage[])[]) => {
				// Verify the user has subscription to the room.
				const room = roomMap.get(clientId);
				if (!room) {
					const nackMessage = createNackMessage(
						400,
						NackErrorType.BadRequestError,
						"Nonexistent client",
					);
					socket.emit("nack", "", [nackMessage]);
				} else {
					let messageCount = 0;
					for (const contentBatch of contentBatches) {
						// Count all messages in each batch for accurate throttling calculation.
						messageCount += Array.isArray(contentBatch) ? contentBatch.length : 1;
					}
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
						isSignalUsageCountingEnabled ? signalUsageData : undefined,
						messageCount /* incrementWeight */,
					);
					if (throttleError) {
						const nackMessage = createNackMessage(
							throttleError.code,
							NackErrorType.ThrottlingError,
							throttleError.message,
							throttleError.retryAfter,
						);
						socket.emit("nack", "", [nackMessage]);
						return;
					}
					contentBatches.forEach((contentBatch) => {
						const contents = Array.isArray(contentBatch)
							? contentBatch
							: [contentBatch];

						for (const content of contents) {
							const signalMessage: ISignalMessage = {
								clientId,
								content,
							};

							socket.emitToRoom(getRoomId(room), "signal", signalMessage);
						}
					});
				}
			},
		);

		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		socket.on("disconnect", async () => {
			if (!connectDocumentComplete && connectDocumentP) {
				Lumberjack.warning(
					`Socket connection disconnected before ConnectDocument completed.`,
				);
				// Wait for document connection to finish before disconnecting.
				// If disconnect fires before roomMap or connectionsMap are updated, we can be left with
				// hanging connections and clients.
				await connectDocumentP.catch(() => {});
			}
			const disconnectMetric = Lumberjack.newLumberMetric(LumberEventName.DisconnectDocument);
			disconnectMetric.setProperties({
				[CommonProperties.connectionCount]: connectionsMap.size,
				[CommonProperties.connectionClients]: JSON.stringify(
					Array.from(connectionsMap.keys()),
				),
				[CommonProperties.roomClients]: JSON.stringify(Array.from(roomMap.keys())),
			});

			if (roomMap.size >= 1) {
				const rooms = Array.from(roomMap.values());
				const documentId = rooms[0].documentId;
				const tenantId = rooms[0].tenantId;
				disconnectMetric.setProperties({
					...getLumberBaseProperties(documentId, tenantId),
				});
			}

			try {
				disconnectDocumentP = disconnectDocument(socket, lambdaSettings, lambdaConnection);
				await disconnectDocumentP;
				disconnectMetric.success(`Successfully disconnected.`);
			} catch (error) {
				disconnectMetric.error(`Disconnect failed.`, error);
			}
		});
	});
}
