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
import { getMessageMetadata, getRoomId } from "./utils";
import { storeClientConnectivityTime } from "./throttleAndUsage";

export async function disconnectDocument(
	socket: IWebSocket,
	{
		clientManager,
		ordererManager,
		logger,
		throttleAndUsageStorageManager,
		socketTracker,
	}: INexusLambdaDependencies,
	{ isClientConnectivityCountingEnabled }: INexusLambdaSettings,
	{
		expirationTimer,
		connectionTimeMap,
		connectionsMap,
		roomMap,
		disconnectedClients,
		disconnectedOrdererConnections,
	}: INexusLambdaConnectionStateTrackers,
): Promise<void> {
	// Clear token expiration timer on disconnection
	expirationTimer.clear();
	const removeAndStoreP: Promise<void>[] = [];
	// Send notification messages for all client IDs in the connection map
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
		removeAndStoreP.push(
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
	}
	// Clear socket tracker upon disconnection
	if (socketTracker) {
		socketTracker.removeSocket(socket.id);
	}
	await Promise.all(removeAndStoreP);
}
