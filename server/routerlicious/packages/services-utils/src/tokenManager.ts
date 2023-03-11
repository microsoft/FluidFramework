/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { NetworkError } from "@fluidframework/server-services-client";
import { IWebSocket } from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

/**
 * Interface of web socket tracker
 * it tracks the mapping of web socket and token used to establish the socket connection
 */
export interface IWebSocketTracker {
	// Add a socket to internal map
	addSocket(compositeTokenId: string, webSocket: IWebSocket);

	// Get socket objects from internal map
	getSockets(compositeTokenId: string): IWebSocket[];

	// Remove socket from tracking
	// Return true if socket is removed, false if socket is not found
	removeSocket(socketId: string): boolean;
}

/**
 * Interface of Json Web Token(JWT) manager
 * It is mainly used to manage token revocation
 */
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
	// Map of composite token id to socket ids. It assumes one token could be used for multiple sockets
	private readonly tokenIdToSocketIdMap: Map<string, Set<string>>;
	// Map of socketId to token ids. It assumes one socket could be used for connections with multiple tokens
	private readonly socketIdToTokenIdMap: Map<string, Set<string>>;

	constructor() {
		this.socketIdToSocketMap = new Map();
		this.tokenIdToSocketIdMap = new Map();
		this.socketIdToTokenIdMap = new Map();
	}

	public addSocket(compositeTokenId: string, webSocket: IWebSocket) {
		if (this.tokenIdToSocketIdMap.has(compositeTokenId)) {
			this.tokenIdToSocketIdMap.get(compositeTokenId)?.add(webSocket.id);
		} else {
			this.tokenIdToSocketIdMap.set(compositeTokenId, new Set([webSocket.id]));
		}

		if (this.socketIdToTokenIdMap.has(webSocket.id)) {
			this.socketIdToTokenIdMap.get(webSocket.id)?.add(compositeTokenId);
		} else {
			this.socketIdToTokenIdMap.set(webSocket.id, new Set([compositeTokenId]));
		}

		this.socketIdToSocketMap.set(webSocket.id, webSocket);
	}

	public getSockets(compositeTokenId: string): IWebSocket[] {
		const socketIds = this.tokenIdToSocketIdMap.get(compositeTokenId);

		if (!socketIds) {
			return [];
		}

		const socketResult: IWebSocket[] = [];
		for (const socketId of socketIds) {
			const socketObj = this.socketIdToSocketMap.get(socketId);
			if (socketObj) {
				socketResult.push(socketObj);
			}
		}
		return socketResult;
	}

	public removeSocket(socketId: string) {
		const tokenIds = this.socketIdToTokenIdMap.get(socketId);

		if (tokenIds) {
			tokenIds.forEach((tokenId: string) => {
				const socketIds = this.tokenIdToSocketIdMap.get(tokenId);
				if (socketIds) {
					socketIds.delete(socketId);
					if (socketIds.size <= 0) {
						this.tokenIdToSocketIdMap.delete(tokenId);
					}
				}
			});
		} else {
			return false;
		}
		this.socketIdToTokenIdMap.delete(socketId);
		return this.socketIdToSocketMap.delete(socketId);
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
