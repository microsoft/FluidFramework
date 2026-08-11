/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IWebSocket, IWebSocketTracker } from "@fluidframework/server-services-core";

/**
 * @internal
 */
export class WebSocketTracker implements IWebSocketTracker {
	// Map of socket id to socket object
	private readonly socketIdToSocketMap: Map<string, IWebSocket>;
	// Map of composite token id to socket ids. It assumes one token could be used for multiple sockets
	private readonly tokenIdToSocketIdMap: Map<string, Set<string>>;
	// Map of socketId to token ids. It assumes one socket could be used for connections with multiple tokens
	private readonly socketIdToTokenIdMap: Map<string, Set<string>>;

	constructor(private readonly useSocketIoRoomFeature: boolean = false) {
		this.socketIdToSocketMap = new Map();
		this.tokenIdToSocketIdMap = new Map();
		this.socketIdToTokenIdMap = new Map();
	}

	public async addSocketForToken(compositeTokenId: string, webSocket: IWebSocket): Promise<void> {
		if (this.useSocketIoRoomFeature) {
			await webSocket.join(compositeTokenId);
		} else {
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
	}

	public getSocketsForToken(compositeTokenId: string): IWebSocket[] {
		if (this.useSocketIoRoomFeature) {
			throw new Error("Method not supported when socket room feature is enabled.");
		}
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

	public addSocket(webSocket: IWebSocket) {
		if (this.useSocketIoRoomFeature) {
			throw new Error("Method not supported when socket room feature is enabled.");
		}
		this.socketIdToSocketMap.set(webSocket.id, webSocket);
	}

	public removeSocket(socketId: string) {
		if (this.useSocketIoRoomFeature) {
			// No need to manually remove socket when socket room feature is enabled
			return false;
		}
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

	public getAllSockets(): IWebSocket[] {
		if (this.useSocketIoRoomFeature) {
			throw new Error("Method not supported when socket room feature is enabled.");
		}
		return Array.from(this.socketIdToSocketMap.values());
	}
}
