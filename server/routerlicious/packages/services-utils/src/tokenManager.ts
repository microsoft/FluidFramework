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
	getSockets(compositeTokenId: string): IWebSocket[];

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
	// Map of socket id to socket object
	private readonly socketIdToSocketMap: Map<string, IWebSocket>;
	// Map of composite token id to socket ids. It assumes one token could be used by multiple sockets
	private readonly tokenIdToSocketIdMap: Map<string, Set<string> >;
	// Map of socketId to token ids. It assumes one socket could be used for connections with multiple tokens
	private readonly socketIdToTokenIdMap: Map<string, Set<string> >;

	constructor() {
		this.socketIdToSocketMap = new Map();
		this.tokenIdToSocketIdMap = new Map();
		this.socketIdToTokenIdMap = new Map();
	}

	public addSocket(compositeTokenId: string, webSocket: IWebSocket) {
		console.log(`yunho: adding token=${compositeTokenId} mapping to socket=${webSocket.id}`);
		console.log(`yunho: Before call map size: tokenIdMapSize=${this.tokenIdToSocketIdMap.size}, socketIdMapSize=${this.socketIdToTokenIdMap.size}`);
		if (this.tokenIdToSocketIdMap.has(compositeTokenId)) {
			console.log(`yunho: Same tokenId=${compositeTokenId} used for multiple sockets`);
			this.tokenIdToSocketIdMap.get(compositeTokenId)?.add(webSocket.id);
		}
		else {
			this.tokenIdToSocketIdMap.set(compositeTokenId, new Set([webSocket.id]));
		}

		if (this.socketIdToTokenIdMap.has(webSocket.id)) {
			console.log(`yunho: Same socketId=${webSocket.id} used for multiple tokens`);
			this.socketIdToTokenIdMap.get(webSocket.id)?.add(compositeTokenId);
		}
		else {
			this.socketIdToTokenIdMap.set(webSocket.id, new Set([compositeTokenId]));
		}

		if (this.socketIdToSocketMap.has(webSocket.id)) {
			console.log(`yunho: trying to add same socket id=${webSocket.id} again`);
		}
		this.socketIdToSocketMap.set(webSocket.id, webSocket);

		console.log(`yunho: After call map size: tokenIdMapSize=${this.tokenIdToSocketIdMap.size}, socketIdMapSize=${this.socketIdToTokenIdMap.size}`);
	}

	public getSockets(compositeTokenId: string): IWebSocket[] {
		const socketIds = this.tokenIdToSocketIdMap.get(compositeTokenId);

		if (!socketIds) {
			return [];
		}

		const socketResult: IWebSocket[] = []
		for (const socketId of socketIds) {
			const socketObj = this.socketIdToSocketMap.get(socketId);
			if (socketObj) {
				socketResult.push(socketObj);
			}
		}
		return socketResult;
	}

	public removeSocket(socketId: string) {
		console.log(`yunho: Remove socket id: ${socketId}`);
		console.log(`yunho: Before call map size: socketMapSize=${this.socketIdToSocketMap.size}, tokenIdMapSize=${this.tokenIdToSocketIdMap.size}, socketIdMapSize=${this.socketIdToTokenIdMap.size}`);
		const tokenIds = this.socketIdToTokenIdMap.get(socketId);

		if (tokenIds) {
			tokenIds.forEach((tokenId: string) => {
				if (!this.tokenIdToSocketIdMap.has(tokenId)) {
					console.log(`yunho: Error, cannot find tokenId=${tokenId} in removeSocket`);
				}
				const socketIds = this.tokenIdToSocketIdMap.get(tokenId);
				if (socketIds) {
					socketIds.delete(socketId);
					if (socketIds.size <= 0) {
						this.tokenIdToSocketIdMap.delete(tokenId);
					}
				}
			});
		}
		else {
			return false;
		}
		this.socketIdToTokenIdMap.delete(socketId);
		const deleted = this.socketIdToSocketMap.delete(socketId);
		console.log(`yunho: After call map size: tokenIdMapSize=${this.tokenIdToSocketIdMap.size}, socketIdMapSize=${this.socketIdToTokenIdMap.size}`);
		return deleted;
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
