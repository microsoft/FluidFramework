/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ScopeType,
	type IClient,
	type IConnect,
	type IConnected,
	type ISignalClient,
	type ITokenClaims,
} from "@fluidframework/protocol-definitions";
import {
	NetworkError,
	isNetworkError,
	validateTokenClaims,
	validateTokenClaimsExpiration,
} from "@fluidframework/server-services-client";
import {
	DefaultServiceConfiguration,
	createCompositeTokenId,
	type IWebSocket,
	TokenRevokedError,
} from "@fluidframework/server-services-core";
import {
	CommonProperties,
	LumberEventName,
	Lumberjack,
	getLumberBaseProperties,
} from "@fluidframework/server-services-telemetry";
import safeStringify from "json-stringify-safe";
import { createRoomJoinMessage, createRuntimeMessage, generateClientId } from "../utils";
import {
	getMessageMetadata,
	handleServerErrorAndConvertToNetworkError,
	getRoomId,
	isWriter,
} from "./utils";
import { StageTrace, sampleMessages } from "./trace";
import { ProtocolVersions, checkVersion } from "./protocol";
import type {
	IBroadcastSignalEventPayload,
	IConnectedClient,
	INexusLambdaConnection,
	INexusLambdaSettings,
	IRoom,
} from "./interfaces";
import { checkThrottleAndUsage, getSocketConnectThrottleId } from "./throttleAndUsage";

const SummarizerClientType = "summarizer";

enum ConnectDocumentStage {
	ConnectDocumentStarted = "ConnectDocumentStarted",
	VersionsChecked = "VersionsChecked",
	ThrottleChecked = "ThrottleChecked",
	TokenVerified = "TokenVerified",
	RoomJoined = "RoomJoined",
	ClientsRetrieved = "ClientsRetrieved",
	MessageClientCreated = "MessageClientCreated",
	MessageClientAdded = "MessageClientAdded",
	TokenExpirySet = "TokenExpirySet",
	MessageClientConnected = "MessageClientConnected",
	SocketTrackerAppended = "SocketTrackerAppended",
	SignalListenerSetUp = "SignalListenerSetUp",
	JoinOpEmitted = "JoinOpEmitted",
}

function composeConnectedMessage(
	messageSize: number,
	mode: "read" | "write",
	serviceConfigurationBlockSize: number,
	serviceConfigurationMaxMessageSize: number,
	clientId: string,
	claims: ITokenClaims,
	version: string,
	clients: ISignalClient[],
): IConnected {
	const connectedMessage: IConnected = {
		claims,
		clientId,
		existing: true,
		maxMessageSize: messageSize,
		mode,
		serviceConfiguration: {
			blockSize: serviceConfigurationBlockSize,
			maxMessageSize: serviceConfigurationMaxMessageSize,
		},
		initialClients: clients,
		initialMessages: [],
		initialSignals: [],
		supportedVersions: ProtocolVersions,
		version,
	};
	return connectedMessage;
}

async function connectOrderer(
	socket: IWebSocket,
	lumberjackProperties: Record<string, any>,
	lambdaSettings: INexusLambdaSettings,
	lambdaConnection: INexusLambdaConnection,
	tenantId: string,
	documentId: string,
	messageClient: IClient,
	startTime: number,
	clientId: string,
	claims: ITokenClaims,
	version: string,
	clients: ISignalClient[],
): Promise<IConnected> {
	const { ordererManager, logger, numberOfMessagesPerTrace } = lambdaSettings;
	const { expirationTimer, connectionsMap } = lambdaConnection;
	const connectDocumentOrdererConnectionMetric = Lumberjack.newLumberMetric(
		LumberEventName.ConnectDocumentOrdererConnection,
		lumberjackProperties,
	);
	const orderer = await ordererManager.getOrderer(tenantId, documentId).catch(async (err) => {
		const errMsg = `Failed to get orderer manager. Error: ${safeStringify(err, undefined, 2)}`;
		connectDocumentOrdererConnectionMetric.error("Failed to get orderer manager", err);
		throw handleServerErrorAndConvertToNetworkError(logger, errMsg, documentId, tenantId, err);
	});

	const connection = await orderer.connect(socket, clientId, messageClient).catch(async (err) => {
		const errMsg = `Failed to connect to orderer. Error: ${safeStringify(err, undefined, 2)}`;
		connectDocumentOrdererConnectionMetric.error("Failed to connect to orderer", err);
		throw handleServerErrorAndConvertToNetworkError(logger, errMsg, documentId, tenantId, err);
	});

	// Eventually we will send disconnect reason as headers to client.
	connection.once("error", (error) => {
		const messageMetaData = getMessageMetadata(connection.documentId, connection.tenantId);

		logger.error(
			`Disconnecting socket on connection error: ${safeStringify(error, undefined, 2)}`,
			{ messageMetaData },
		);
		Lumberjack.error(
			`Disconnecting socket on connection error`,
			getLumberBaseProperties(connection.documentId, connection.tenantId),
			error,
		);
		expirationTimer.clear();
		socket.disconnect(true);
	});

	let clientJoinMessageServerMetadata: any;
	if (DefaultServiceConfiguration.enableTraces && sampleMessages(numberOfMessagesPerTrace)) {
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
		connectDocumentOrdererConnectionMetric.error("Failed to establish orderer connection", err);
		throw handleServerErrorAndConvertToNetworkError(logger, errMsg, documentId, tenantId, err);
	});

	connectionsMap.set(clientId, connection);
	if (connectionsMap.size > 1) {
		Lumberjack.info(
			`Same socket is having multiple connections, connection number=${connectionsMap.size}`,
			getLumberBaseProperties(connection.documentId, connection.tenantId),
		);
	}

	connectDocumentOrdererConnectionMetric.success("Successfully established orderer connection");

	return composeConnectedMessage(
		connection.maxMessageSize,
		"write",
		connection.serviceConfiguration.blockSize,
		connection.serviceConfiguration.maxMessageSize,
		clientId,
		claims,
		version,
		clients,
	);
}

function trackSocket(
	socket: IWebSocket,
	tenantId: string,
	documentId: string,
	claims: ITokenClaims,
	{ socketTracker }: INexusLambdaSettings,
) {
	// Track socket and tokens for this connection
	if (socketTracker && claims.jti) {
		socketTracker.addSocketForToken(
			createCompositeTokenId(tenantId, documentId, claims.jti),
			socket,
		);
	}
}

function checkThrottle(tenantId: string, { throttlers, logger }: INexusLambdaSettings): void {
	const throttleErrorPerCluster = checkThrottleAndUsage(
		throttlers.connectionsPerCluster,
		getSocketConnectThrottleId("connectDoc"),
		tenantId,
		logger,
	);
	if (throttleErrorPerCluster) {
		// eslint-disable-next-line @typescript-eslint/no-throw-literal
		throw throttleErrorPerCluster;
	}
	const throttleErrorPerTenant = checkThrottleAndUsage(
		throttlers.connectionsPerTenant,
		getSocketConnectThrottleId(tenantId),
		tenantId,
		logger,
	);
	if (throttleErrorPerTenant) {
		// eslint-disable-next-line @typescript-eslint/no-throw-literal
		throw throttleErrorPerTenant;
	}
}

async function checkToken(
	token: string | null,
	tenantId: string,
	documentId: string,
	{ tenantManager, revokedTokenChecker, logger }: INexusLambdaSettings,
): Promise<ITokenClaims> {
	if (!token) {
		throw new NetworkError(403, "Must provide an authorization token");
	}
	const claims = validateTokenClaims(token, documentId, tenantId);
	try {
		if (revokedTokenChecker && claims.jti) {
			const isTokenRevoked: boolean = await revokedTokenChecker.isTokenRevoked(
				claims.tenantId,
				claims.documentId,
				claims.jti,
			);
			if (isTokenRevoked) {
				throw new TokenRevokedError(
					403,
					"Permission denied. Token has been revoked",
					false /* canRetry */,
					true /* isFatal */,
				);
			}
		}
		await tenantManager.verifyToken(claims.tenantId, token);
		return claims;
	} catch (error: any) {
		if (isNetworkError(error)) {
			throw error;
		}
		// We don't understand the error, so it is likely an internal service error.
		const errMsg = `Could not verify connect document token. Error: ${safeStringify(
			error,
			undefined,
			2,
		)}`;
		throw handleServerErrorAndConvertToNetworkError(
			logger,
			errMsg,
			claims.documentId,
			claims.tenantId,
			error,
		);
	}
}

async function joinRoomAndSubscribeToChannel(
	socket: IWebSocket,
	tenantId: string,
	documentId: string,
	{ logger }: INexusLambdaSettings,
): Promise<[string, IRoom]> {
	const clientId = generateClientId();

	const room: IRoom = {
		tenantId,
		documentId,
	};

	try {
		// Subscribe to channels.
		await Promise.all([socket.join(getRoomId(room)), socket.join(`client#${clientId}`)]);
		return [clientId, room];
	} catch (err) {
		const errMsg = `Could not subscribe to channels. Error: ${safeStringify(
			err,
			undefined,
			2,
		)}`;
		throw handleServerErrorAndConvertToNetworkError(logger, errMsg, documentId, tenantId, err);
	}
}

async function retrieveClients(
	tenantId: string,
	documentId: string,
	metricProperties: Record<string, any>,
	{ clientManager, logger, maxNumberOfClientsPerDocument }: INexusLambdaSettings,
): Promise<ISignalClient[]> {
	const connectDocumentGetClientsMetric = Lumberjack.newLumberMetric(
		LumberEventName.ConnectDocumentGetClients,
		metricProperties,
	);
	const clients = await clientManager
		.getClients(tenantId, documentId)
		.then((response) => {
			connectDocumentGetClientsMetric.success("Successfully got clients from client manager");
			return response;
		})
		.catch(async (err) => {
			const errMsg = `Failed to get clients. Error: ${safeStringify(err, undefined, 2)}`;
			connectDocumentGetClientsMetric.error(
				"Failed to get clients during connectDocument",
				err,
			);
			throw handleServerErrorAndConvertToNetworkError(
				logger,
				errMsg,
				documentId,
				tenantId,
				err,
			);
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
	return clients;
}

function createMessageClientAndJoinRoom(
	client: IClient,
	claims: ITokenClaims,
	room: IRoom,
	clientId: string,
	connectedTimestamp: number,
	{ connectionTimeMap, scopeMap, roomMap }: INexusLambdaConnection,
): Partial<IClient> {
	// Todo should all the client details come from the claims???
	// we are still trusting the users permissions and type here.
	const messageClient: Partial<IClient> = client ?? {};
	messageClient.user = claims.user;
	messageClient.scopes = claims.scopes;
	const isSummarizer = messageClient.details?.type === SummarizerClientType;

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

	return messageClient;
}

async function addMessageClientToClientManager(
	tenantId: string,
	documentId: string,
	clientId: string,
	messageClient: Partial<IClient>,
	metricProperties: { clientId: string; tenantId: string; documentId: string },
	{ clientManager, logger }: INexusLambdaSettings,
) {
	const connectDocumentAddClientMetric = Lumberjack.newLumberMetric(
		LumberEventName.ConnectDocumentAddClient,
		metricProperties,
	);
	try {
		await clientManager.addClient(tenantId, documentId, clientId, messageClient as IClient);
		connectDocumentAddClientMetric.success("Successfully added client");
	} catch (err) {
		const errMsg = `Could not add client. Error: ${safeStringify(err, undefined, 2)}`;
		connectDocumentAddClientMetric.error("Error adding client during connectDocument", err);
		throw handleServerErrorAndConvertToNetworkError(logger, errMsg, documentId, tenantId, err);
	}
}

function setUpSignalListenerForRoomBroadcasting(
	socket: IWebSocket,
	room: IRoom,
	documentId: string,
	tenantId: string,
	{ collaborationSessionEventEmitter, logger }: INexusLambdaSettings,
) {
	collaborationSessionEventEmitter?.on(
		"broadcastSignal",
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		async (broadcastSignal: IBroadcastSignalEventPayload) => {
			const { signalRoom, signalContent } = broadcastSignal;

			// No-op if the room (collab session) that signal came in from is different
			// than the current room. We reuse websockets so there could be multiple rooms
			// that we are sending the signal to, and we don't want to do that.
			if (
				signalRoom.documentId === room.documentId &&
				signalRoom.tenantId === room.tenantId
			) {
				try {
					const runtimeMessage = createRuntimeMessage(signalContent);

					socket
						.emitToRoom(getRoomId(signalRoom), "signal", runtimeMessage)
						.catch((error: any) => {
							const errorMsg = `Failed to broadcast signal from external API.`;
							Lumberjack.error(
								errorMsg,
								getLumberBaseProperties(signalRoom.documentId, signalRoom.tenantId),
								error,
							);
						});
				} catch (error) {
					const errorMsg = `broadcast-signal content body is malformed`;
					throw handleServerErrorAndConvertToNetworkError(
						logger,
						errorMsg,
						documentId,
						tenantId,
						error,
					);
				}
			}
		},
	);
}

export async function connectDocument(
	socket: IWebSocket,
	lambdaSettings: INexusLambdaSettings,
	lambdaConnection: INexusLambdaConnection,
	message: IConnect,
	properties: Record<string, any>,
): Promise<IConnectedClient> {
	const { isTokenExpiryEnabled, maxTokenLifetimeSec } = lambdaSettings;
	const { expirationTimer } = lambdaConnection;

	const connectionTrace = new StageTrace<ConnectDocumentStage>(
		ConnectDocumentStage.ConnectDocumentStarted,
	);
	const startTime = Date.now();

	const connectMetric = Lumberjack.newLumberMetric(LumberEventName.ConnectDocument, properties);

	let tenantId = message.tenantId;
	let documentId = message.id;
	let uncaughtError: any;
	try {
		const [connectVersions, version] = checkVersion(message.versions);
		connectionTrace.stampStage(ConnectDocumentStage.VersionsChecked);

		checkThrottle(tenantId, lambdaSettings);
		connectionTrace.stampStage(ConnectDocumentStage.ThrottleChecked);

		const claims = await checkToken(message.token, tenantId, documentId, lambdaSettings);
		// check token validate tenantId/documentId for consistent, throw 403 if now.
		// Following change tenantId/documentId from claims, just in case future code changes that we can remember to use the ones from claim.
		tenantId = claims.tenantId;
		documentId = claims.documentId;
		connectionTrace.stampStage(ConnectDocumentStage.TokenVerified);

		const [clientId, room] = await joinRoomAndSubscribeToChannel(
			socket,
			tenantId,
			documentId,
			lambdaSettings,
		);
		connectionTrace.stampStage(ConnectDocumentStage.RoomJoined);

		const subMetricProperties = {
			...getLumberBaseProperties(documentId, tenantId),
			[CommonProperties.clientId]: clientId,
		};
		const clients = await retrieveClients(
			tenantId,
			documentId,
			subMetricProperties,
			lambdaSettings,
		);
		connectionTrace.stampStage(ConnectDocumentStage.ClientsRetrieved);

		const connectedTimestamp = Date.now();
		const messageClient = createMessageClientAndJoinRoom(
			message.client,
			claims,
			room,
			clientId,
			connectedTimestamp,
			lambdaConnection,
		);
		connectionTrace.stampStage(ConnectDocumentStage.MessageClientCreated);

		await addMessageClientToClientManager(
			tenantId,
			documentId,
			clientId,
			messageClient,
			subMetricProperties,
			lambdaSettings,
		);
		connectionTrace.stampStage(ConnectDocumentStage.MessageClientAdded);

		if (isTokenExpiryEnabled) {
			const lifeTimeMSec = validateTokenClaimsExpiration(claims, maxTokenLifetimeSec);
			expirationTimer.set(lifeTimeMSec);
		}
		connectionTrace.stampStage(ConnectDocumentStage.TokenExpirySet);

		const isWriterClient = isWriter(messageClient.scopes ?? [], message.mode);
		connectMetric.setProperty("IsWriterClient", isWriterClient);
		const connectedMessage = isWriterClient
			? await connectOrderer(
					socket,
					subMetricProperties,
					lambdaSettings,
					lambdaConnection,
					tenantId,
					documentId,
					messageClient as IClient,
					startTime,
					clientId,
					claims,
					version,
					clients,
			  )
			: composeConnectedMessage(
					1024 /* messageSize */,
					"read",
					DefaultServiceConfiguration.blockSize,
					DefaultServiceConfiguration.maxMessageSize,
					clientId,
					claims,
					version,
					clients,
			  );
		// back-compat: remove cast to any once new definition of IConnected comes through.
		(connectedMessage as any).timestamp = connectedTimestamp;
		connectionTrace.stampStage(ConnectDocumentStage.MessageClientConnected);

		trackSocket(socket, tenantId, documentId, claims, lambdaSettings);
		connectionTrace.stampStage(ConnectDocumentStage.SocketTrackerAppended);

		setUpSignalListenerForRoomBroadcasting(socket, room, documentId, tenantId, lambdaSettings);
		connectionTrace.stampStage(ConnectDocumentStage.SignalListenerSetUp);

		const result = {
			connection: connectedMessage,
			connectVersions,
			details: messageClient as IClient,
		};

		socket.emitToRoom(
			getRoomId(room),
			"signal",
			createRoomJoinMessage(result.connection.clientId, result.details),
		);
		connectionTrace.stampStage(ConnectDocumentStage.JoinOpEmitted);

		connectMetric.setProperties({
			[CommonProperties.clientId]: result.connection.clientId,
			[CommonProperties.clientCount]: result.connection.initialClients.length + 1,
			[CommonProperties.clientType]: result.details.details?.type,
		});

		return {
			connection: connectedMessage,
			connectVersions,
			details: messageClient as IClient,
		};
	} catch (err) {
		uncaughtError = err;
		throw err;
	} finally {
		connectMetric.setProperty("connectTrace", connectionTrace);
		if (!uncaughtError) {
			connectMetric.success(`Connect document successful`);
		} else {
			if (uncaughtError.code !== undefined) {
				connectMetric.setProperty(CommonProperties.errorCode, uncaughtError.code);
			}
			connectMetric.error(`Connect document failed`, uncaughtError);
		}
	}
}
