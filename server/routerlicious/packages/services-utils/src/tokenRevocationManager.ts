/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	IWebSocket,
	IWebSocketTracker,
	ITokenRevocationManager,
	ITokenRevocationResponse,
} from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { NetworkError } from "@fluidframework/server-services-client";

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

	public addSocketForToken(compositeTokenId: string, webSocket: IWebSocket) {
		const socketIds = this.tokenIdToSocketIdMap.get(compositeTokenId);
		if (socketIds) {
			socketIds.add(webSocket.id);
		} else {
			this.tokenIdToSocketIdMap.set(compositeTokenId, new Set([webSocket.id]));
		}

		const tokenIds = this.socketIdToTokenIdMap.get(webSocket.id);
		if (tokenIds) {
			tokenIds.add(compositeTokenId);
		} else {
			this.socketIdToTokenIdMap.set(webSocket.id, new Set([compositeTokenId]));
		}

		this.socketIdToSocketMap.set(webSocket.id, webSocket);
	}

	public getSocketsForToken(compositeTokenId: string): IWebSocket[] {
		const socketIds = this.tokenIdToSocketIdMap.get(compositeTokenId);

		if (!socketIds) {
			return [];
		}

		const socketResult: IWebSocket[] = [];
		socketIds.forEach((socketId: string) => {
			const socketObj = this.socketIdToSocketMap.get(socketId);
			if (socketObj) {
				socketResult.push(socketObj);
			}
		});
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
		}
		this.socketIdToTokenIdMap.delete(socketId);
		return this.socketIdToSocketMap.delete(socketId);
	}
}

export class DummyTokenRevocationManager implements ITokenRevocationManager {
	public async start() {
		Lumberjack.info(`DummyTokenManager started`);
	}

	public async initialize(): Promise<void> {
		Lumberjack.info(`DummyTokenManager initialize called`);
	}

	public async close(): Promise<void> {
		Lumberjack.info(`DummyTokenManager closed`);
	}

	// Revoke the access of a token given its jwtId
	public async revokeToken(tenantId: string, documentId: string, jwtId: string): Promise<ITokenRevocationResponse> {
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
