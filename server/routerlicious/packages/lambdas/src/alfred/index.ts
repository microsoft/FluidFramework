/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
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
	getRandomInt,
	isNetworkError,
	NetworkError,
	validateTokenClaims,
	validateTokenClaimsExpiration,
} from "@fluidframework/server-services-client";

import safeStringify from "json-stringify-safe";
import * as semver from "semver";
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
import {
	ConnectionCountLogger,
	createRoomJoinMessage,
	createNackMessage,
	createRoomLeaveMessage,
	createRuntimeMessage,
	generateClientId,
	IRuntimeSignalEnvelope,
} from "../utils";
import {
	IBroadcastSignalEventPayload,
	ICollaborationSessionEvents,
	IConnectedClient,
	IRoom,
} from "./interfaces";
export { IBroadcastSignalEventPayload, ICollaborationSessionEvents, IRoom } from "./interfaces";

const summarizerClientType = "summarizer";

function getRoomId(room: IRoom) {
	return `${room.tenantId}/${room.documentId}`;
}

const getMessageMetadata = (documentId: string, tenantId: string) => ({
	documentId,
	tenantId,
});

const handleServerError = async (
	logger: core.ILogger,
	errorMessage: string,
	documentId: string,
	tenantId: string,
) => {
	logger.error(errorMessage, { messageMetaData: getMessageMetadata(documentId, tenantId) });
	Lumberjack.error(errorMessage, getLumberBaseProperties(documentId, tenantId));
	throw new NetworkError(500, "Failed to connect client to document.");
};

const getSocketConnectThrottleId = (tenantId: string) => `${tenantId}_OpenSocketConn`;

const getSubmitOpThrottleId = (clientId: string, tenantId: string) =>
	`${clientId}_${tenantId}_SubmitOp`;

const getSubmitSignalThrottleId = (clientId: string, tenantId: string) =>
	`${clientId}_${tenantId}_SubmitSignal`;

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
 * Stores client connectivity time in a Redis list.
 */
async function storeClientConnectivityTime(
	clientId: string,
	documentId: string,
	tenantId: string,
	connectionTimestamp: number,
	throttleAndUsageStorageManager: core.IThrottleAndUsageStorageManager,
) {
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
		Lumberjack.error(
			`ClientConnectivity data storage failed`,
			{
				[CommonProperties.clientId]: clientId,
				[BaseTelemetryProperties.tenantId]: tenantId,
				[BaseTelemetryProperties.documentId]: documentId,
			},
			error,
		);
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
	usageData?: core.IUsageData,
	incrementWeight: number = 1,
): core.ThrottlingError | undefined {
	if (!throttler) {
		return;
	}

	try {
		throttler.incrementCount(throttleId, incrementWeight, usageStorageId, usageData);
	} catch (error) {
		if (error instanceof core.ThrottlingError) {
			return error;
		} else {
			logger?.error(`Throttle increment failed: ${safeStringify(error, undefined, 2)}`, {
				messageMetaData: {
					key: throttleId,
					eventName: "throttling",
				},
			});
			Lumberjack.error(
				`Throttle increment failed`,
				{
					[CommonProperties.telemetryGroupName]: "throttling",
					[BaseTelemetryProperties.tenantId]: tenantId,
				},
				error,
			);
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

		let connectDocumentComplete: boolean = false;
		let connectDocumentP: Promise<void> | undefined;
		const clientIdConnectionsDisconnected = new Set<string>();
		const clientIdClientsDisconnected = new Set<string>();
		let disconnectDocumentP: Promise<void> | undefined;

		// Timer to check token expiry for this socket connection
		let expirationTimer: NodeJS.Timer | undefined;

		const connectionCountLogger = new ConnectionCountLogger(process.env.NODE_NAME, cache);

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
			const startTime = Date.now();
			const throttleErrorPerCluster = checkThrottleAndUsage(
				connectThrottlerPerCluster,
				getSocketConnectThrottleId("connectDoc"),
				message.tenantId,
				logger,
			);
			if (throttleErrorPerCluster) {
				// eslint-disable-next-line @typescript-eslint/no-throw-literal
				throw throttleErrorPerCluster;
			}
			const throttleErrorPerTenant = checkThrottleAndUsage(
				connectThrottlerPerTenant,
				getSocketConnectThrottleId(message.tenantId),
				message.tenantId,
				logger,
			);
			if (throttleErrorPerTenant) {
				// eslint-disable-next-line @typescript-eslint/no-throw-literal
				throw throttleErrorPerTenant;
			}

			if (!message.token) {
				throw new NetworkError(403, "Must provide an authorization token");
			}

			// Validate token signature and claims, and check if it's revoked
			const token = message.token;
			const claims = validateTokenClaims(token, message.id, message.tenantId);
			try {
				if (revokedTokenChecker && claims.jti) {
					const isTokenRevoked: boolean = await revokedTokenChecker.isTokenRevoked(
						claims.tenantId,
						claims.documentId,
						claims.jti,
					);
					if (isTokenRevoked) {
						throw new core.TokenRevokedError(
							403,
							"Permission denied. Token has been revoked",
							false /* canRetry */,
							true /* isFatal */,
						);
					}
				}
				await tenantManager.verifyToken(claims.tenantId, token);
			} catch (error) {
				if (isNetworkError(error)) {
					throw error;
				}
				// We don't understand the error, so it is likely an internal service error.
				const errMsg = `Could not verify connect document token. Error: ${safeStringify(
					error,
					undefined,
					2,
				)}`;
				return handleServerError(logger, errMsg, claims.documentId, claims.tenantId);
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
					socket.join(`client#${clientId}`),
				]);
			} catch (err) {
				const errMsg = `Could not subscribe to channels. Error: ${safeStringify(
					err,
					undefined,
					2,
				)}`;
				return handleServerError(logger, errMsg, claims.documentId, claims.tenantId);
			}

			const lumberjackProperties = {
				...getLumberBaseProperties(claims.documentId, claims.tenantId),
				[CommonProperties.clientId]: clientId,
			};

			const connectDocumentGetClientsMetric = Lumberjack.newLumberMetric(
				LumberEventName.ConnectDocumentGetClients,
				lumberjackProperties,
			);
			const clients = await clientManager
				.getClients(claims.tenantId, claims.documentId)
				.then((response) => {
					connectDocumentGetClientsMetric.success(
						"Successfully got clients from client manager",
					);
					return response;
				})
				.catch(async (err) => {
					const errMsg = `Failed to get clients. Error: ${safeStringify(
						err,
						undefined,
						2,
					)}`;
					connectDocumentGetClientsMetric.error(
						"Failed to get clients during connectDocument",
						err,
					);
					return handleServerError(logger, errMsg, claims.documentId, claims.tenantId);
				});

			if (clients.length > maxNumberOfClientsPerDocument) {
				throw new NetworkError(
					429,
					"Too Many Clients Connected to Document",
					true /* canRetry */,
					false /* isFatal */,
					5 * 60 * 1000 /* retryAfterMs (5 min) */,
				);
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
				messageClient.scopes = claims.scopes.filter(
					(scope) => scope !== ScopeType.SummaryWrite,
				);
				connectionTimeMap.set(clientId, connectedTimestamp);
			}

			// back-compat: remove cast to any once new definition of IClient comes through.
			(messageClient as any).timestamp = connectedTimestamp;

			// Cache the scopes.
			scopeMap.set(clientId, messageClient.scopes);

			// Join the room to receive signals.
			roomMap.set(clientId, room);

			// increment connection count after the client is added to the room.
			// excluding summarizer for total client count.
			if (!isSummarizer) {
				connectionCountLogger.incrementConnectionCount();
			}

			// Iterate over the version ranges provided by the client and select the best one that works
			const connectVersions = message.versions ? message.versions : ["^0.1.0"];
			const version = selectProtocolVersion(connectVersions);
			if (!version) {
				throw new NetworkError(
					400,
					`Unsupported client protocol. Server: ${protocolVersions}. Client: ${JSON.stringify(
						connectVersions,
					)}`,
				);
			}

			const connectDocumentAddClientMetric = Lumberjack.newLumberMetric(
				LumberEventName.ConnectDocumentAddClient,
				lumberjackProperties,
			);
			try {
				await clientManager.addClient(
					claims.tenantId,
					claims.documentId,
					clientId,
					messageClient as IClient,
				);
				connectDocumentAddClientMetric.success("Successfully added client");
			} catch (err) {
				const errMsg = `Could not add client. Error: ${safeStringify(err, undefined, 2)}`;
				connectDocumentAddClientMetric.error(
					"Error adding client during connectDocument",
					err,
				);
				return handleServerError(logger, errMsg, claims.documentId, claims.tenantId);
			}

			if (isTokenExpiryEnabled) {
				const lifeTimeMSec = validateTokenClaimsExpiration(claims, maxTokenLifetimeSec);
				setExpirationTimer(lifeTimeMSec);
			}

			let connectedMessage: IConnected;
			if (isWriter(messageClient.scopes, message.mode)) {
				const connectDocumentOrdererConnectionMetric = Lumberjack.newLumberMetric(
					LumberEventName.ConnectDocumentOrdererConnection,
					lumberjackProperties,
				);
				const orderer = await orderManager
					.getOrderer(claims.tenantId, claims.documentId)
					.catch(async (err) => {
						const errMsg = `Failed to get orderer manager. Error: ${safeStringify(
							err,
							undefined,
							2,
						)}`;
						connectDocumentOrdererConnectionMetric.error(
							"Failed to get orderer manager",
							err,
						);
						return handleServerError(
							logger,
							errMsg,
							claims.documentId,
							claims.tenantId,
						);
					});

				const connection = await orderer
					.connect(socket, clientId, messageClient as IClient)
					.catch(async (err) => {
						const errMsg = `Failed to connect to orderer. Error: ${safeStringify(
							err,
							undefined,
							2,
						)}`;
						connectDocumentOrdererConnectionMetric.error(
							"Failed to connect to orderer",
							err,
						);
						return handleServerError(
							logger,
							errMsg,
							claims.documentId,
							claims.tenantId,
						);
					});

				// Eventually we will send disconnect reason as headers to client.
				connection.once("error", (error) => {
					const messageMetaData = getMessageMetadata(
						connection.documentId,
						connection.tenantId,
					);

					logger.error(
						`Disconnecting socket on connection error: ${safeStringify(
							error,
							undefined,
							2,
						)}`,
						{ messageMetaData },
					);
					Lumberjack.error(
						`Disconnecting socket on connection error`,
						getLumberBaseProperties(connection.documentId, connection.tenantId),
						error,
					);
					clearExpirationTimer();
					socket.disconnect(true);
				});

				let clientJoinMessageServerMetadata: any;
				if (
					core.DefaultServiceConfiguration.enableTraces &&
					sampleMessages(numberOfMessagesPerTrace)
				) {
					clientJoinMessageServerMetadata = {
						connectDocumentStartTime: startTime,
					};
				}
				connection.connect(clientJoinMessageServerMetadata).catch(async (err) => {
					const errMsg = `Failed to connect to the orderer connection. Error: ${safeStringify(
						err,
						undefined,
						2,
					)}`;
					connectDocumentOrdererConnectionMetric.error(
						"Failed to establish orderer connection",
						err,
					);
					return handleServerError(logger, errMsg, claims.documentId, claims.tenantId);
				});

				connectionsMap.set(clientId, connection);
				if (connectionsMap.size > 1) {
					Lumberjack.info(
						`Same socket is having multiple connections, connection number=${connectionsMap.size}`,
						getLumberBaseProperties(connection.documentId, connection.tenantId),
					);
				}

				connectDocumentOrdererConnectionMetric.success(
					"Successfully established orderer connection",
				);

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

			// Track socket and tokens for this connection
			if (socketTracker && claims.jti) {
				socketTracker.addSocketForToken(
					core.createCompositeTokenId(message.tenantId, message.id, claims.jti),
					socket,
				);
			}

			// Set up listener to forward signal to clients in the collaboration session when the broadcast-signal endpoint is called
			collaborationSessionEventEmitter?.on(
				"broadcastSignal",
				(broadcastSignal: IBroadcastSignalEventPayload) => async () => {
					const { signalRoom, signalContent } = broadcastSignal;

					// No-op if the room (collab session) that signal came in from is different
					// than the current room. We reuse websockets so there could be multiple rooms
					// that we are sending the signal to, and we don't want to do that.
					if (
						signalRoom.documentId === room.documentId &&
						signalRoom.tenantId === room.tenantId
					) {
						try {
							const contents = JSON.parse(signalContent) as IRuntimeSignalEnvelope;
							const runtimeMessage = createRuntimeMessage(contents);

							socket
								.emitToRoom(getRoomId(signalRoom), "signal", runtimeMessage)
								.catch((error: any) => {
									const errorMsg = `Failed to broadcast signal from external API.`;
									Lumberjack.error(
										errorMsg,
										getLumberBaseProperties(
											signalRoom.documentId,
											signalRoom.tenantId,
										),
										error,
									);
								});
						} catch (error) {
							const errorMsg = `broadcast-signal conent body is malformed`;
							return handleServerError(
								logger,
								errorMsg,
								claims.documentId,
								claims.tenantId,
							);
						}
					}
				},
			);

			return {
				connection: connectedMessage,
				connectVersions,
				details: messageClient as IClient,
			};
		}

		async function disconnectDocument() {
			// Clear token expiration timer on disconnection
			clearExpirationTimer();
			const removeAndStoreP: Promise<void>[] = [];
			// Send notification messages for all client IDs in the connection map
			for (const [clientId, connection] of connectionsMap) {
				if (clientIdConnectionsDisconnected.has(clientId)) {
					// We already removed this clientId once. Skip it.
					continue;
				}
				const messageMetaData = getMessageMetadata(
					connection.documentId,
					connection.tenantId,
				);
				logger.info(`Disconnect of ${clientId}`, { messageMetaData });
				Lumberjack.info(
					`Disconnect of ${clientId}`,
					getLumberBaseProperties(connection.documentId, connection.tenantId),
				);

				connection
					.disconnect()
					.then(() => {
						// Keep track of disconnected clientIds so that we don't repeat the disconnect signal
						// for the same clientId if retrying when connectDocument completes after disconnectDocument.
						clientIdConnectionsDisconnected.add(clientId);
					})
					.catch((error) => {
						const errorMsg = `Failed to disconnect client ${clientId} from orderer connection.`;
						Lumberjack.error(
							errorMsg,
							getLumberBaseProperties(connection.documentId, connection.tenantId),
							error,
						);
					});
				if (isClientConnectivityCountingEnabled && throttleAndUsageStorageManager) {
					const connectionTimestamp = connectionTimeMap.get(clientId);
					if (connectionTimestamp) {
						removeAndStoreP.push(
							storeClientConnectivityTime(
								clientId,
								connection.documentId,
								connection.tenantId,
								connectionTimestamp,
								throttleAndUsageStorageManager,
							),
						);
					}
				}
			}
			// Send notification messages for all client IDs in the room map
			for (const [clientId, room] of roomMap) {
				if (clientIdClientsDisconnected.has(clientId)) {
					// We already removed this clientId once. Skip it.
					continue;
				}
				const messageMetaData = getMessageMetadata(room.documentId, room.tenantId);
				// excluding summarizer for total client count.
				if (connectionTimeMap.has(clientId)) {
					connectionCountLogger.decrementConnectionCount();
				}
				logger.info(`Disconnect of ${clientId} from room`, { messageMetaData });
				Lumberjack.info(
					`Disconnect of ${clientId} from room`,
					getLumberBaseProperties(room.documentId, room.tenantId),
				);
				removeAndStoreP.push(
					clientManager
						.removeClient(room.tenantId, room.documentId, clientId)
						.then(() => {
							// Keep track of disconnected clientIds so that we don't repeat the disconnect signal
							// for the same clientId if retrying when connectDocument completes after disconnectDocument.
							clientIdClientsDisconnected.add(clientId);
						}),
				);
				socket
					.emitToRoom(getRoomId(room), "signal", createRoomLeaveMessage(clientId))
					.catch((error) => {
						const errorMsg = `Failed to emit signal to room ${clientId}, ${getRoomId(
							room,
						)}.`;
						Lumberjack.error(
							errorMsg,
							getLumberBaseProperties(room.documentId, room.tenantId),
							error,
						);
					});
			}
			// Clear socket tracker upon disconnection
			if (socketTracker) {
				socketTracker.removeSocket(socket.id);
			}
			await Promise.all(removeAndStoreP);
		}

		// Note connect is a reserved socket.io word so we use connect_document to represent the connect request
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		socket.on("connect_document", async (connectionMessage: IConnect) => {
			const userAgentInfo = parseRelayUserAgent(connectionMessage.relayUserAgent);
			const driverVersion: string | undefined = userAgentInfo.driverVersion;
			const connectMetric = Lumberjack.newLumberMetric(LumberEventName.ConnectDocument);
			const baseLumberjackProperties = getLumberBaseProperties(
				connectionMessage.id,
				connectionMessage.tenantId,
			);
			const correlationId = uuid();
			connectMetric.setProperties({
				...baseLumberjackProperties,
				[CommonProperties.clientDriverVersion]: driverVersion,
				[CommonProperties.connectionCount]: connectionsMap.size,
				[CommonProperties.connectionClients]: JSON.stringify(
					Array.from(connectionsMap.keys()),
				),
				[CommonProperties.roomClients]: JSON.stringify(Array.from(roomMap.keys())),
				[BaseTelemetryProperties.correlationId]: correlationId,
			});

			connectDocumentP = getGlobalTelemetryContext().bindPropertiesAsync(
				{ correlationId, ...baseLumberjackProperties },
				async () =>
					connectDocument(connectionMessage)
						.then((message) => {
							socket.emit("connect_document_success", message.connection);
							const room = roomMap.get(message.connection.clientId);
							if (room) {
								socket.emitToRoom(
									getRoomId(room),
									"signal",
									createRoomJoinMessage(
										message.connection.clientId,
										message.details,
									),
								);
							}

							connectMetric.setProperties({
								[CommonProperties.clientId]: message.connection.clientId,
								[CommonProperties.clientCount]:
									message.connection.initialClients.length + 1,
								[CommonProperties.clientType]: message.details.details?.type,
							});
							connectMetric.success(`Connect document successful`);
						})
						.catch((error) => {
							socket.emit("connect_document_error", error);
							clearExpirationTimer();
							if (error?.code !== undefined) {
								connectMetric.setProperty(CommonProperties.errorCode, error.code);
							}
							connectMetric.error(`Connect document failed`, error);
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
											clientIdConnectionsDisconnected.size;
										const alreadyDisconnectedAllClients: boolean =
											roomMap.size === clientIdClientsDisconnected.size;
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

										disconnectDocument()
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
								const sanitizedMessageWithTrace = addAlfredTrace(
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
				disconnectDocumentP = disconnectDocument();
				await disconnectDocumentP;
				disconnectMetric.success(`Successfully disconnected.`);
			} catch (error) {
				disconnectMetric.error(`Disconnect failed.`, error);
			}
		});
	});
}

function addAlfredTrace(
	message: IDocumentMessage,
	numberOfMessagesPerTrace: number,
	clientId: string,
	tenantId: string,
	documentId: string,
) {
	if (
		message &&
		core.DefaultServiceConfiguration.enableTraces &&
		sampleMessages(numberOfMessagesPerTrace)
	) {
		if (message.traces === undefined) {
			message.traces = [];
		}
		message.traces.push({
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
