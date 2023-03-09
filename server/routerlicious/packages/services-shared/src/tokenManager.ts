/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IWebSocket } from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

// Track
export interface IWebSocketTracker {
	// Add a socket to internal map
	addSocket(compositeTokenId: string, webSocket: IWebSocket);

	// Get socket objects from internal map
	getSockets(compositeTokenId: string): IWebSocket[] | undefined;

	// Remove docket from internal map
	// Return true if socket is removed from map, false if socket is not found
	removeSocket(socketId: string): boolean;

	// Disconnect socket with id and remove from internal map
	// disconnectSocket(id: string, actionBeforeDisconnect?: (socket: IWebSocket) => Promise<void>): Promise<void>;
}

export interface IJsonWebTokenManager {
	initialize(): Promise<void>;

	start();

	stop(): Promise<void>;

	// Revoke the access of a token given its jwtId
	revokeToken(tenantId: string, documentId: string, jwtId: string): Promise<void>;

	// Check if a given token id is revoked
	isTokenRevoked(tenantId: string, documentId: string, jwtId: string): Promise<boolean>;
}

export class WebSocketTracker implements IWebSocketTracker {
	// Map of composite token id to socket object
	private readonly tokenIdToSocketMap: Map<string, IWebSocket[]>;
	private readonly socketIdToTokenIdMap: Map<string, string>;

	constructor() {
		this.tokenIdToSocketMap = new Map();
		this.socketIdToTokenIdMap = new Map();
	}

	public addSocket(compositeTokenId: string, webSocket: IWebSocket) {
		if (this.tokenIdToSocketMap.has(compositeTokenId)) {
			console.log(`yunho: Same tokenId=${compositeTokenId} used for multiple sockets`);
			this.tokenIdToSocketMap.get(compositeTokenId)?.push(webSocket);
		} else {
			this.tokenIdToSocketMap.set(compositeTokenId, [webSocket]);
		}

		// TODO: remove this statement before merge
		if (this.socketIdToTokenIdMap.has(webSocket.id)) {
			console.log(
				`yunho: SocketId=${webSocket.id} is already mapped to this token=${compositeTokenId}`,
			);
		}
		this.socketIdToTokenIdMap.set(webSocket.id, compositeTokenId);
	}

	public getSockets(compositeTokenId: string): IWebSocket[] | undefined {
		return this.tokenIdToSocketMap.get(compositeTokenId);
	}

	public removeSocket(socketId: string) {
		const compositeTokenId = this.socketIdToTokenIdMap.get(socketId);
		if (!compositeTokenId) {
			return false;
		}
		this.socketIdToTokenIdMap.delete(socketId);
		return this.tokenIdToSocketMap.delete(compositeTokenId);
	}

	// private cleanup() {
	// 	this.tokenIssuedTimeMap.forEach((timeInMilliseconds, compositeId) => {
	// 		const lifeTimeMilliseconds =
	// 			timeInMilliseconds + this.tokenMaxLifetimeInMilliseconds - (new Date()).getTime();
	// 		if (lifeTimeMilliseconds < 0) {
	// 			this.socketMap.delete(compositeId);
	// 			this.tokenIssuedTimeMap.delete(compositeId);
	// 		}
	// 	});
	// }

	// public async disconnectSocket(
	// 	compositeId: string,
	// 	actionBeforeDisconnect?: (socket: IWebSocket) => Promise<void>): Promise<void> {
	// 	const sockets = this.socketMap.get(compositeId);
	// 	if (!sockets) {
	// 		return;
	// 	}

	// 	for (const socket of sockets) {
	// 		if (actionBeforeDisconnect) {
	// 			await actionBeforeDisconnect(socket);
	// 		}
	// 		socket.disconnect(true);
	// 	}
	// 	this.socketMap.delete(compositeId);
	// }
}

export function createCompositeTokenId(
	tenantId: string,
	documentId: string,
	jwtId: string,
): string {
	return `${tenantId}/${documentId}/${jwtId}`;
}

export class EmptyImplementationTokenManager implements IJsonWebTokenManager {
	public start() {
		Lumberjack.info(`start called`);
	}

	public async initialize(): Promise<void> {
		Lumberjack.info(`EmptyImplementationTokenManager: initialize called`);
	}

	public async stop(): Promise<void> {
		Lumberjack.info(`EmptyImplementationTokenManager: stop called`);
	}

	// Revoke the access of a token given its jwtId
	public async revokeToken(tenantId: string, documentId: string, jwtId: string): Promise<void> {
		Lumberjack.info(`EmptyImplementationTokenManager: revokeToken called`);
	}

	// Check if a given token id is revoked
	public async isTokenRevoked(
		tenantId: string,
		documentId: string,
		jwtId: string,
	): Promise<boolean> {
		Lumberjack.info(`isTokenRevoked called`);
		return false;
	}
}
