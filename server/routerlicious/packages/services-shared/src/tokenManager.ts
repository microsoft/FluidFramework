/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IWebSocket } from "@fluidframework/server-services-core"
import { Lumberjack } from "@fluidframework/server-services-telemetry";

export interface IWebSocketManager {
	// Add socket to internal map
	addSocket(id: string, webSocket: IWebSocket);

	// Remove docket from internal map
	// Return true if socket is removed from map, false if socket is not found
	removeSocket(id: string): boolean;

	// Get socket object from internal map
	getSocket(id: string): IWebSocket | undefined;

	// Disconnect socket with id and remove from internal map
	disconnectSocket(id: string, actionBeforeDisconnect?: (socket: IWebSocket) => Promise<void>): Promise<void>;
}

export interface IJsonWebTokenManager {

	initialize(): Promise<void>;

	start(): Promise<void>;

	stop(): Promise<void>;

	// Revoke the access of a token given its jwtId
	revokeToken(tenantId: string, documentId: string, jwtId: string): Promise<void>;

	// Check if a given token id is revoked
	isTokenRevoked(tenantId: string, documentId: string, jwtId: string): Promise<boolean>;
}

export class WebSocketManager implements IWebSocketManager {
	private readonly socketMap: Map<string, IWebSocket>

	constructor() {
		this.socketMap = new Map();
	}

	public addSocket(id: string, webSocket: IWebSocket) {
		this.socketMap.set(id, webSocket);
	}

	public removeSocket(id: string) {
		return this.socketMap.delete(id);
	}

	public getSocket(id: string): IWebSocket | undefined {
		return this.socketMap.get(id);
	}

	public async disconnectSocket(
		id: string,
		actionBeforeDisconnect?: (socket: IWebSocket) => Promise<void>): Promise<void> {
		const socket = this.socketMap.get(id);
		if (!socket) {
			return;
		}

		if (actionBeforeDisconnect) {
			await actionBeforeDisconnect(socket);
		}
		socket.disconnect(true);
		this.socketMap.delete(id);
	}
}

export function createSocketId(tenantId: string, documentId: string, jwtId: string): string {
	return `${tenantId}/${documentId}/${jwtId}`;
}

export class EmptyImplementationTokenManager implements IJsonWebTokenManager {

	public async start(): Promise<void> {
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
	public async isTokenRevoked(tenantId: string, documentId: string, jwtId: string): Promise<boolean> {
		Lumberjack.info(`isTokenRevoked called`);
		return false;
	}
}