/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IClient } from "@fluidframework/protocol-definitions";
import type { IWebSocket, IWebSocketServer } from "@fluidframework/server-services-core";
import type { Server as SocketIoServer, Socket as SocketIoSocket } from "socket.io";
import type { IRoom } from "./interfaces";
import { getRoomId } from "./utils";

/**
 * Checks if a generic {@link IWebSocketServer} has an internalServerInstance that is specifically a {@link SocketIoServer}.
 */
function isSocketIoServer(server: IWebSocketServer): server is IWebSocketServer<SocketIoServer> {
	return (
		(server as IWebSocketServer<SocketIoServer>).internalServerInstance !== undefined &&
		typeof (server as IWebSocketServer<SocketIoServer>).internalServerInstance?.in ===
			"function" &&
		typeof (server as IWebSocketServer<SocketIoServer>).internalServerInstance?.to ===
			"function" &&
		typeof (server as IWebSocketServer<SocketIoServer>).internalServerInstance?.fetchSockets ===
			"function" &&
		typeof (server as IWebSocketServer<SocketIoServer>).internalServerInstance
			?.serverSideEmitWithAck === "function" &&
		typeof (server as IWebSocketServer<SocketIoServer>).internalServerInstance?.emitWithAck ===
			"function"
	);
}

/**
 * Checks if a generic {@link IWebSocket} has an internalSocketInstance that is specifically a {@link SocketIoSocket}.
 */
function isSocketIoSocket(socket: IWebSocket): socket is IWebSocket<SocketIoSocket> {
	return (
		(socket as IWebSocket<SocketIoSocket>).internalSocketInstance !== undefined &&
		typeof (socket as IWebSocket<SocketIoSocket>).internalSocketInstance?.id === "string" &&
		typeof (socket as IWebSocket<SocketIoSocket>).internalSocketInstance?.handshake ===
			"object" &&
		typeof (socket as IWebSocket<SocketIoSocket>).internalSocketInstance?.connected ===
			"boolean" &&
		typeof (socket as IWebSocket<SocketIoSocket>).internalSocketInstance?.recovered ===
			"boolean"
	);
}

/**
 * Retrieves the internal {@link SocketIoSocket} instance from a generic {@link IWebSocket} instance.
 * If it is not a {@link SocketIoSocket} or does not exist, returns undefined.
 */
export function getInternalSocketIoSocket(socket: IWebSocket): SocketIoSocket | undefined {
	if (isSocketIoSocket(socket)) {
		return socket.internalSocketInstance;
	}
	return undefined;
}

/**
 * Retrieves the internal {@link SocketIoServer} instance from a generic {@link IWebSocketServer} instance.
 * If it is not a {@link SocketIoServer} or does not exist, returns undefined.
 */
export function getInternalSocketIoServer(server: IWebSocketServer): SocketIoServer | undefined {
	if (isSocketIoServer(server)) {
		return server.internalServerInstance;
	}
	return undefined;
}

export interface ISocketIoSocketMetadata {
	tenantId?: string;
	documentId?: string;
	clientId?: string;
	client?: IClient;
}
/**
 * Check if the given data is a valid {@link ISocketIoSocketMetadata} object.
 */
function isSocketMetadata(data: unknown): data is ISocketIoSocketMetadata {
	return (
		typeof data === "object" &&
		(typeof (data as ISocketIoSocketMetadata).tenantId === "undefined" ||
			typeof (data as ISocketIoSocketMetadata).tenantId === "string") &&
		(typeof (data as ISocketIoSocketMetadata).documentId === "undefined" ||
			typeof (data as ISocketIoSocketMetadata).documentId === "string") &&
		(typeof (data as ISocketIoSocketMetadata).clientId === "undefined" ||
			typeof (data as ISocketIoSocketMetadata).clientId === "string")
	);
}

/**
 * Utilize built-in Socket.io functionality to track socket metadata.
 */
export class SocketIoSocketHelper {
	public isValid: boolean = false;
	private readonly socket: SocketIoSocket | undefined;

	constructor(webSocket: IWebSocket) {
		this.socket = getInternalSocketIoSocket(webSocket);
		this.isValid = this.socket !== undefined;
	}

	public get data(): ISocketIoSocketMetadata {
		if (this.socket && isSocketMetadata(this.socket.data)) {
			return this.socket.data;
		}
		return {};
	}

	public set data(data: Partial<ISocketIoSocketMetadata>) {
		if (!this.socket) {
			return;
		}
		this.socket.data = {
			...this.socket.data,
			...data,
		};
	}
}

export class SocketIoServerHelper {
	public isValid: boolean = false;
	private readonly server: SocketIoServer | undefined;

	constructor(
		webSocketServer: IWebSocketServer,
		private readonly namespace = "/",
	) {
		this.server = getInternalSocketIoServer(webSocketServer);
		this.isValid = this.server !== undefined;
	}

	/**
	 * Returns a list of socket ids in the given room.
	 */
	public getSocketsInRoom(room: IRoom): Map<string, ISocketIoSocketMetadata> {
		if (this.server === undefined) {
			return new Map<string, ISocketIoSocketMetadata>();
		}
		const sockets = this.server.of(this.namespace).sockets;
		const socketIdsInRoom = this.server.of(this.namespace).adapter.rooms.get(getRoomId(room));
		const socketMetadataForRoom = new Map<string, ISocketIoSocketMetadata>();
		for (const socketId of socketIdsInRoom ?? []) {
			const socket = sockets?.get(socketId);
			socketMetadataForRoom.set(socketId, socket?.data ?? {});
		}
		return socketMetadataForRoom;
	}
}
