/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack, getLumberBaseProperties } from "@fluidframework/server-services-telemetry";
import type { IWebSocket } from "@fluidframework/server-services-core";
import { createRoomLeaveMessage } from "../utils";
import type {
	INexusLambdaConnectionStateTrackers,
	INexusLambdaDependencies,
	INexusLambdaSettings,
} from "./interfaces";
import { getMessageMetadata, getRoomId, isSummarizer, isWriter } from "./utils";
import { storeClientConnectivityTime } from "./throttleAndUsage";

/**
 * Disconnect all orderer connections and store connectivity time for each.
 */
function disconnectOrdererConnections(
	{ ordererManager, logger, throttleAndUsageStorageManager }: INexusLambdaDependencies,
	{ isClientConnectivityCountingEnabled }: INexusLambdaSettings,
	{
		connectionTimeMap,
		connectionsMap,
		disconnectedOrdererConnections,
	}: INexusLambdaConnectionStateTrackers,
): Promise<void>[] {
	const promises: Promise<void>[] = [];
	for (const [clientId, connection] of connectionsMap) {
		if (disconnectedOrdererConnections.has(clientId)) {
			// We already removed this clientId once. Skip it.
			continue;
		}
		const messageMetaData = getMessageMetadata(connection.documentId, connection.tenantId);
		logger.info(`Disconnect of ${clientId}`, { messageMetaData });
		const lumberjackProperties = getLumberBaseProperties(
			connection.documentId,
			connection.tenantId,
		);
		Lumberjack.info(`Disconnect of ${clientId}`, lumberjackProperties);

		connection
			.disconnect()
			.then(() => {
				// Keep track of disconnected clientIds so that we don't repeat the disconnect signal
				// for the same clientId if retrying when connectDocument completes after disconnectDocument.
				disconnectedOrdererConnections.add(clientId);
				ordererManager.removeOrderer(connection.tenantId, connection.documentId);
			})
			.catch((error) => {
				const errorMsg = `Failed to disconnect client ${clientId} from orderer connection.`;
				Lumberjack.error(errorMsg, lumberjackProperties, error);
			});
		if (isClientConnectivityCountingEnabled && throttleAndUsageStorageManager) {
			const connectionTimestamp = connectionTimeMap.get(clientId);
			if (connectionTimestamp) {
				promises.push(
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
	return promises;
}

/**
 * Remove clients from the client manager and send client leave notifications to the room.
 */
function removeClientAndSendNotifications(
	socket: IWebSocket,
	{ clientManager, logger, collaborationSessionTracker }: INexusLambdaDependencies,
	{
		roomMap,
		clientMap,
		connectionTimeMap,
		disconnectedClients,
	}: INexusLambdaConnectionStateTrackers,
): Promise<void>[] {
	const promises: Promise<void>[] = [];
	for (const [clientId, room] of roomMap) {
		if (disconnectedClients.has(clientId)) {
			// We already removed this clientId once. Skip it.
			continue;
		}
		const messageMetaData = getMessageMetadata(room.documentId, room.tenantId);

		logger.info(`Disconnect of ${clientId} from room`, { messageMetaData });
		Lumberjack.info(
			`Disconnect of ${clientId} from room`,
			getLumberBaseProperties(room.documentId, room.tenantId),
		);
		promises.push(
			clientManager
				.removeClient(room.tenantId, room.documentId, clientId)
				.then(() => {
					// Keep track of disconnected clientIds so that we don't repeat the disconnect signal
					// for the same clientId if retrying when connectDocument completes after disconnectDocument.
					disconnectedClients.add(clientId);
				})
				.catch((error) => {
					Lumberjack.error(
						`Failed to remove client ${clientId} from client manager`,
						getLumberBaseProperties(room.documentId, room.tenantId),
						error,
					);
				}),
		);
		try {
			socket.emitToRoom(getRoomId(room), "signal", createRoomLeaveMessage(clientId));
		} catch (error) {
			const errorMsg = `Failed to emit signal to room ${clientId}, ${getRoomId(room)}.`;
			Lumberjack.error(
				errorMsg,
				getLumberBaseProperties(room.documentId, room.tenantId),
				error,
			);
		}
		// Update session tracker upon disconnection
		if (collaborationSessionTracker) {
			const client = clientMap.get(clientId);
			const connectionTimestamp = connectionTimeMap.get(clientId);
			if (client) {
				collaborationSessionTracker.endClientSession(
					{
						clientId,
						joinedTime: connectionTimestamp ?? 0,
						isSummarizerClient: isSummarizer(client.details),
						isWriteClient: isWriter(client.scopes, client.mode),
					},
					{
						tenantId: room.tenantId,
						documentId: room.documentId,
					},
				).catch((error) => {
					Lumberjack.error(
						"Failed to update collaboration session tracker for client disconnection",
						{ messageMetaData },
						error,
					);
				});
			}
		}
	}
	return promises;
}

/**
 * Perform necessary cleanup when a client disconnects from a document.
 * @internal
 */
export async function disconnectDocument(
	socket: IWebSocket,
	nexusLambdaDependencies: INexusLambdaDependencies,
	nexusLambdaSettings: INexusLambdaSettings,
	nexusLambdaConnectionStateTrackers: INexusLambdaConnectionStateTrackers,
): Promise<void> {
	// Clear token expiration timer on disconnection
	nexusLambdaConnectionStateTrackers.expirationTimer.clear();
	// Iterate over connection and room maps to disconnect and store connectivity time.
	const removeAndStoreP: Promise<void>[] = [
		// Disconnect any orderer connections
		...disconnectOrdererConnections(
			nexusLambdaDependencies,
			nexusLambdaSettings,
			nexusLambdaConnectionStateTrackers,
		),
		// Send notification messages for all client IDs in the room map
		...removeClientAndSendNotifications(
			socket,
			nexusLambdaDependencies,
			nexusLambdaConnectionStateTrackers,
		),
	];
	// Clear socket tracker upon disconnection
	if (nexusLambdaDependencies.socketTracker) {
		nexusLambdaDependencies.socketTracker.removeSocket(socket.id);
	}
	await Promise.all(removeAndStoreP);
}
