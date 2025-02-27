/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
	IClient,
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
	type INexusLambdaConnectionStateTrackers,
	type INexusLambdaDependencies,
} from "./interfaces";
import {
	ExpirationTimer,
	isSentSignalMessage,
	getClientSpecificRoomId,
	getRoomId,
	hasWriteAccess,
} from "./utils";
import {
	checkThrottleAndUsage,
	getSubmitOpThrottleId,
	getSubmitSignalThrottleId,
} from "./throttleAndUsage";
import { addNexusMessageTrace } from "./trace";
import { connectDocument } from "./connect";
import { disconnectDocument } from "./disconnect";
import { isValidConnectionMessage } from "./protocol";

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
	for (const [key, value] of propertyKeyValuePairs) {
		// Trim key and value so that a user agent like "prop1:val1; prop2:val2" is parsed correctly.
		if (key && value) map[key.trim()] = value.trim();
	}
	return map;
}

// TODO: documentation
// eslint-disable-next-line jsdoc/require-description
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
	collaborationSessionTracker?: core.ICollaborationSessionTracker,
): void {
	const lambdaDependencies: INexusLambdaDependencies = {
		ordererManager,
		tenantManager,
		clientManager,
		logger,
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
		collaborationSessionTracker,
	};
	const lambdaSettings: INexusLambdaSettings = {
		maxTokenLifetimeSec,
		isTokenExpiryEnabled,
		isClientConnectivityCountingEnabled,
		maxNumberOfClientsPerDocument,
		numberOfMessagesPerTrace,
	};
	webSocketServer.on("connection", (socket: core.IWebSocket) => {
		// Timer to check token expiry for this socket connection
		const expirationTimer = new ExpirationTimer(() => socket.disconnect(true));

		/**
		 * Maps and sets to track various information related to client connections.
		 * Note: These maps/sets are expected to have only one client id entry.
		 */

		// Map from client IDs on this connection to the object ID and user info
		const connectionsMap = new Map<string, core.IOrdererConnection>();

		// Map from client IDs to room
		const roomMap = new Map<string, IRoom>();

		// Map from client Ids to scope
		const scopeMap = new Map<string, string[]>();

		// Map from client Ids to client details
		const clientMap = new Map<string, IClient>();

		// Map from client Ids to connection time.
		const connectionTimeMap = new Map<string, number>();

		// Map from client Ids to supportedFeatures ()
		const supportedFeaturesMap = new Map<string, Record<string, unknown>>();

		// Set of client Ids that have been disconnected from orderer.
		const disconnectedOrdererConnections = new Set<string>();

		// Set of client Ids that have been disconnected from room and client manager.
		const disconnectedClients = new Set<string>();

		const lambdaConnectionStateTrackers: INexusLambdaConnectionStateTrackers = {
			connectionsMap,
			roomMap,
			scopeMap,
			clientMap,
			connectionTimeMap,
			expirationTimer,
			disconnectedOrdererConnections,
			disconnectedClients,
			supportedFeaturesMap,
		};

		let connectDocumentComplete: boolean = false;
		let connectDocumentP: Promise<void> | undefined;
		let disconnectDocumentP: Promise<void> | undefined;

		const disposers: ((() => void) | undefined)[] = [socket.dispose?.bind(socket)];

		// Note connect is a reserved socket.io word so we use connect_document to represent the connect request
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		socket.on("connect_document", async (connectionMessage: unknown) => {
			if (!isValidConnectionMessage(connectionMessage)) {
				// If the connection message is invalid, emit an error and return.
				// This will prevent the connection from being established, but more importantly
				// it will provent the service from crashing due to an unhandled exception such as a type error.
				const error = new NetworkError(400, "Invalid connection message");
				// Attempt to log the connection message properties if they are available.
				// Be cautious to not log any sensitive information, such as message.token or message.user.
				const safeTelemetryProperties: Record<string, any> =
					typeof connectionMessage === "object" &&
					connectionMessage !== null &&
					typeof (connectionMessage as IConnect).id === "string" &&
					typeof (connectionMessage as IConnect).tenantId === "string"
						? getLumberBaseProperties(
								(connectionMessage as IConnect).id,
								(connectionMessage as IConnect).tenantId,
						  )
						: {};
				if (
					typeof (connectionMessage as IConnect | undefined)?.driverVersion === "string"
				) {
					safeTelemetryProperties.driverVersion = (
						connectionMessage as IConnect
					).driverVersion;
				} else if (
					typeof (connectionMessage as IConnect | undefined)?.relayUserAgent === "string"
				) {
					safeTelemetryProperties.driverVersion = parseRelayUserAgent(
						(connectionMessage as IConnect).relayUserAgent,
					).driverVersion;
				}
				Lumberjack.warning(
					"Received invalid connection message",
					safeTelemetryProperties,
					error,
				);
				socket.emit("connect_document_error", error);
				return;
			}

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
				[CommonProperties.connectionClients]: JSON.stringify([...connectionsMap.keys()]),
				[CommonProperties.roomClients]: JSON.stringify([...roomMap.keys()]),
				[BaseTelemetryProperties.correlationId]: correlationId,
			};

			connectDocumentP = getGlobalTelemetryContext().bindPropertiesAsync(
				{ correlationId, ...baseLumberjackProperties },
				async () =>
					connectDocument(
						socket,
						lambdaDependencies,
						lambdaSettings,
						lambdaConnectionStateTrackers,
						connectionMessage,
						properties,
					)
						.then((message) => {
							socket.emit("connect_document_success", message.connection);
							disposers.push(message.dispose);
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
											[CommonProperties.connectionClients]: JSON.stringify([
												...connectionsMap.keys(),
											]),
											[CommonProperties.roomClients]: JSON.stringify([
												...roomMap.keys(),
											]),
										});

										disconnectDocument(
											socket,
											lambdaDependencies,
											lambdaSettings,
											lambdaConnectionStateTrackers,
										)
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
				if (connection) {
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
					const handleMessageBatchProcessingError = (error: any): void => {
						if (isNetworkError(error) && error.code === 413) {
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
						Lumberjack.error(
							"Error processing submitted op(s)",
							lumberjackProperties,
							error,
						);
					};
					for (const messageBatch of messageBatches) {
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
										Lumberjack.error("Op size too large", {
											...lumberjackProperties,
											messageSize,
											maxMessageSize,
										});
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
						} catch (error) {
							handleMessageBatchProcessingError(error);
						}
					}
				} else {
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
				}
			},
		);

		// Message sent when a new signal is submitted to the router.
		socket.on(
			"submitSignal",
			// TODO: semantic documentation
			// eslint-disable-next-line jsdoc/require-description
			/**
			 * @param contentBatches - typed as `unknown` array as it comes from wire and has not been validated.
			 * v1 signals are expected to be an array of strings (Json.stringified `ISignalEnvelope`s from
			 * [Container.submitSignal](https://github.com/microsoft/FluidFramework/blob/ccb26baf65be1cbe3f708ec0fe6887759c25be6d/packages/loader/container-loader/src/container.ts#L2292-L2294)
			 * and sent via
			 * [DocumentDeltaConnection.emitMessages](https://github.com/microsoft/FluidFramework/blob/ccb26baf65be1cbe3f708ec0fe6887759c25be6d/packages/drivers/driver-base/src/documentDeltaConnection.ts#L313C1-L321C4)),
			 * but actual content is passed-thru and not decoded.
			 *
			 * v2 signals are expected to be an array of `ISentSignalMessage` objects.
			 */
			(clientId: string, contentBatches: unknown[]) => {
				// Verify the user has subscription to the room.
				const room = roomMap.get(clientId);
				if (room) {
					if (!Array.isArray(contentBatches)) {
						const nackMessage = createNackMessage(
							400,
							NackErrorType.BadRequestError,
							"Invalid signal message",
						);
						socket.emit("nack", "", [nackMessage]);
						return;
					}
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

					if (supportedFeaturesMap.get(clientId)?.submit_signals_v2) {
						for (const signal of contentBatches) {
							if (isSentSignalMessage(signal)) {
								const signalMessage: ISignalMessage = {
									...signal,
									clientId,
								};

								const roomId: string =
									signal.targetClientId === undefined
										? getRoomId(room)
										: getClientSpecificRoomId(signal.targetClientId);

								socket.emitToRoom(roomId, "signal", signalMessage);
							} else {
								// If the signal is not in the expected format, nack the message.
								// This will disconnect client from the socket.
								// No signals sent after this message will be processed.
								const nackMessage = createNackMessage(
									400,
									NackErrorType.BadRequestError,
									"Invalid signal message",
								);
								socket.emit("nack", "", [nackMessage]);
								return;
							}
						}
					} else {
						for (const contentBatch of contentBatches) {
							const contents = Array.isArray(contentBatch)
								? contentBatch
								: [contentBatch];
							for (const content of contents) {
								const signalMessage: ISignalMessage = {
									clientId,
									content,
								};
								const roomId: string = getRoomId(room);

								socket.emitToRoom(roomId, "signal", signalMessage);
							}
						}
					}
				} else {
					const nackMessage = createNackMessage(
						400,
						NackErrorType.BadRequestError,
						"Nonexistent client",
					);
					socket.emit("nack", "", [nackMessage]);
				}
			},
		);

		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		socket.on("disconnect", async (reason: unknown) => {
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
				[CommonProperties.connectionClients]: JSON.stringify([...connectionsMap.keys()]),
				[CommonProperties.roomClients]: JSON.stringify([...roomMap.keys()]),
				// Socket.io provides disconnect reason as a string. If it is not a string, it might not be a socket.io socket, so don't log anything.
				// A list of possible reasons can be found here: https://socket.io/docs/v4/server-socket-instance/#disconnect
				[CommonProperties.disconnectReason]:
					typeof reason === "string" ? reason : undefined,
			});

			if (roomMap.size > 0) {
				const rooms = [...roomMap.values()];
				const documentId = rooms[0].documentId;
				const tenantId = rooms[0].tenantId;
				disconnectMetric.setProperties({
					...getLumberBaseProperties(documentId, tenantId),
				});
			}

			try {
				disconnectDocumentP = disconnectDocument(
					socket,
					lambdaDependencies,
					lambdaSettings,
					lambdaConnectionStateTrackers,
				);
				await disconnectDocumentP;
				disconnectMetric.success(`Successfully disconnected.`);
			} catch (error) {
				disconnectMetric.error(`Disconnect failed.`, error);
			}

			// Dispose all resources and clear list.
			for (const dispose of disposers) {
				if (dispose) {
					dispose();
				}
			}
			disposers.splice(0, disposers.length);
		});

		socket.on(
			"disconnect_document",
			(clientId: string, documentId: string, errorType?: string) => {
				if (errorType === undefined) {
					return;
				}
				Lumberjack.error(
					`Error for client ${clientId}, document ${documentId}: ${errorType}`,
				);
			},
		);
	});
}
