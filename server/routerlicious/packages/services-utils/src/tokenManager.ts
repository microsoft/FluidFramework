/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { NetworkError } from "@fluidframework/server-services-client";
import { IWebSocket } from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

// Track
export interface IWebSocketTracker {
	// Add a socket to internal map
	addSocket(compositeTokenId: string, webSocket: IWebSocket);

	// Get socket objects from internal map
	getSockets(compositeTokenId: string): IWebSocket[] | undefined;

	// Remove docket from tracking
	// Return true if socket is removed, false if socket is not found
	removeSocket(socketId: string): boolean;
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
	// Map of composite token id to socket objects
	private readonly tokenIdToSocketMap: Map<string, IWebSocket[]>;
	// It assumes one socket object only has connection with one token
	private readonly socketIdToTokenIdMap: Map<string, string>;

	constructor() {
		this.tokenIdToSocketMap = new Map();
		this.socketIdToTokenIdMap = new Map();
	}

	public addSocket(compositeTokenId: string, webSocket: IWebSocket) {
		console.log(`yunho: adding token=${compositeTokenId} mapping to socket=${webSocket.id}`);
		console.log(`yunho: Before call map size: tokenIdMapSize=${this.tokenIdToSocketMap.size}, socketIdMapSize=${this.socketIdToTokenIdMap.size}`);
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
		console.log(`After call map size: tokenIdMapSize=${this.tokenIdToSocketMap.size}, socketIdMapSize=${this.socketIdToTokenIdMap.size}`);
	}

	public getSockets(compositeTokenId: string): IWebSocket[] | undefined {
		return this.tokenIdToSocketMap.get(compositeTokenId);
	}

	public removeSocket(socketId: string) {
		console.log(`yunho: Remove socket id: ${socketId}`);
		console.log(`yunho: Before call map size: tokenIdMapSize=${this.tokenIdToSocketMap.size}, socketIdMapSize=${this.socketIdToTokenIdMap.size}`);
		const compositeTokenId = this.socketIdToTokenIdMap.get(socketId);
		if (!compositeTokenId) {
			return false;
		}
		const sockets = this.tokenIdToSocketMap.get(compositeTokenId);
		if (sockets) {
			const filteredSocketList = sockets.filter((socket: IWebSocket) => {
				return socket.id !== socketId;
			});
			if (filteredSocketList.length <= 0) {
				this.tokenIdToSocketMap.delete(compositeTokenId);
			}
			else {
				this.tokenIdToSocketMap.set(compositeTokenId, filteredSocketList);
			}
		}
		this.socketIdToTokenIdMap.delete(socketId);
		console.log(`yunho: After call map size: tokenIdMapSize=${this.tokenIdToSocketMap.size}, socketIdMapSize=${this.socketIdToTokenIdMap.size}`);
		return true;
	}
}

export function createCompositeTokenId(
	tenantId: string,
	documentId: string,
	jwtId: string,
): string {
	return `${tenantId}/${documentId}/${jwtId}`;
}

export class DummyTokenManager implements IJsonWebTokenManager {
	public start() {
		Lumberjack.info(`DummyTokenManager started`);
	}

	public async initialize(): Promise<void> {
		Lumberjack.info(`DummyTokenManager initialize called`);
	}

	public async stop(): Promise<void> {
		Lumberjack.info(`DummyTokenManager stopped`);
	}

	// Revoke the access of a token given its jwtId
	public async revokeToken(tenantId: string, documentId: string, jwtId: string): Promise<void> {
		Lumberjack.info(`DummyTokenManager revokeToken called`);
		throw new NetworkError(501, "Token revocation is not supported for now", false, true);
	}

	// Check if a given token id is revoked
	public async isTokenRevoked(
		tenantId: string,
		documentId: string,
		jwtId: string,
	): Promise<boolean> {
		Lumberjack.info(`DummyTokenManager isTokenRevoked called`);
		return false;
	}
}
