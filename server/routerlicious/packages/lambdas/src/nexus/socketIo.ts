/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import type { IClient } from "@fluidframework/protocol-definitions";
import type { IWebSocket, IWebSocketServer } from "@fluidframework/server-services-core";
import { LumberEventName, Lumberjack } from "@fluidframework/server-services-telemetry";
import type { Server as SocketIoServer, Socket as SocketIoSocket } from "socket.io";
import type { IRoom } from "./interfaces";
import { getRoomId } from "./utils";
import type { IEvent } from "../events";

/**
 * Checks if a generic {@link IWebSocketServer} has an internalServerInstance that is specifically a {@link SocketIoServer}.
 */
function isSocketIoServer(
	internalServerInstance: unknown,
): internalServerInstance is SocketIoServer {
	return (
		internalServerInstance !== undefined &&
		typeof (internalServerInstance as SocketIoServer).in === "function" &&
		typeof (internalServerInstance as SocketIoServer).to === "function" &&
		typeof (internalServerInstance as SocketIoServer).fetchSockets === "function" &&
		typeof (internalServerInstance as SocketIoServer).serverSideEmitWithAck === "function"
	);
}

/**
 * Checks if a generic {@link IWebSocket} has an internalSocketInstance that is specifically a {@link SocketIoSocket}.
 */
function isSocketIoSocket(
	internalSocketInstance: unknown,
): internalSocketInstance is SocketIoSocket {
	return (
		internalSocketInstance !== undefined &&
		typeof (internalSocketInstance as SocketIoSocket).id === "string" &&
		typeof (internalSocketInstance as SocketIoSocket).handshake === "object" &&
		typeof (internalSocketInstance as SocketIoSocket).connected === "boolean" &&
		typeof (internalSocketInstance as SocketIoSocket).recovered === "boolean"
	);
}

/**
 * Retrieves the internal {@link SocketIoSocket} instance from a generic {@link IWebSocket} instance.
 * If it is not a {@link SocketIoSocket} or does not exist, returns undefined.
 */
export function getInternalSocketIoSocket(socket: IWebSocket): SocketIoSocket | undefined {
	if (isSocketIoSocket(socket.internalSocketInstance)) {
		return socket.internalSocketInstance;
	}
	return undefined;
}

/**
 * Retrieves the internal {@link SocketIoServer} instance from a generic {@link IWebSocketServer} instance.
 * If it is not a {@link SocketIoServer} or does not exist, returns undefined.
 */
export function getInternalSocketIoServer(server: IWebSocketServer): SocketIoServer | undefined {
	if (isSocketIoServer(server.internalServerInstance)) {
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

interface ISocketIoSocketHelperEvent extends IEvent {
	(event: "pingpong", listener: (latencyMs: number) => void): void;
	(event: "close", listener: () => void): void;
}

/**
 * Utilize built-in Socket.io functionality to track socket metadata.
 */
export class SocketIoSocketHelper extends TypedEventEmitter<ISocketIoSocketHelperEvent> {
	public isValid: boolean = false;
	private readonly socket: SocketIoSocket | undefined;

	constructor(webSocket: IWebSocket) {
		super();
		this.socket = getInternalSocketIoSocket(webSocket);
		this.isValid = this.socket !== undefined;
		this.initializeEventTrackersAndEmitters();
		this.socket?.conn.on("close", () => {
			this.emit("close");
		});
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

	private initializeEventTrackersAndEmitters() {
		let lastPingStartTime: number | undefined;
		const packetCreateHandler = (packet: any) => {
			if (packet.type === "ping") {
				lastPingStartTime = Date.now();
			}
		};
		this.socket?.conn.on("packetCreate", packetCreateHandler);
		const packetReceivedHandler = (packet: any) => {
			if (packet.type === "pong") {
				if (lastPingStartTime !== undefined) {
					this.emit("pingpong", Date.now() - lastPingStartTime);
					lastPingStartTime = undefined;
				}
			}
		};
		this.socket?.conn.on("packet", packetReceivedHandler);
		this.socket?.conn.on("close", () => {
			this.socket?.conn.off("packetCreate", packetCreateHandler);
			this.socket?.conn.off("packet", packetReceivedHandler);
		});
	}
}

export class SocketIoServerHelper {
	public isValid: boolean = false;
	private readonly server: SocketIoServer | undefined;

	constructor(webSocketServer: IWebSocketServer) {
		this.server = getInternalSocketIoServer(webSocketServer);
		this.isValid = this.server !== undefined;
	}

	/**
	 * Returns a list of socket ids in the given room.
	 */
	public async getSocketsInRoom(room: IRoom): Promise<Map<string, ISocketIoSocketMetadata>> {
		if (this.server === undefined) {
			return new Map<string, ISocketIoSocketMetadata>();
		}
		const sockets = await this.server.in(getRoomId(room)).fetchSockets();
		const socketMetadataForRoom = new Map<string, ISocketIoSocketMetadata>();
		for (const socket of sockets) {
			socketMetadataForRoom.set(socket.id, socket.data ?? {});
		}
		return socketMetadataForRoom;
	}
}

/**
 * Logs the average of all data points added to the aggregator over a given interval.
 */
export class SocketIoPingPongLatencyTracker {
	private count: number = 0;
	private sumMs: number = 0;

	constructor(
		private readonly metricProperties: Map<string, any> | Record<string, any> = {},
		metricLoggingIntervalMs: number = 60_000,
		private readonly logAsLumberMetric: boolean = false,
	) {
		if (metricLoggingIntervalMs > 0) {
			setInterval(() => {
				this.logMetric();
			}, metricLoggingIntervalMs);
		}
	}

	public trackSocket(socketHelper: SocketIoSocketHelper): void {
		if (!socketHelper.isValid) {
			return;
		}
		const pingpongHandler = (latencyMs: number) => {
			this.count++;
			this.sumMs += latencyMs;
		};
		socketHelper.on("pingpong", pingpongHandler);
		socketHelper.on("close", () => {
			socketHelper.off("pingpong", pingpongHandler);
		});
	}

	private logMetric(): void {
		const averageMS = this.sumMs / this.count;
		this.sumMs = 0;
		this.count = 0;
		if (this.logAsLumberMetric) {
			const metric = Lumberjack.newLumberMetric(LumberEventName.SocketPingPong, {
				...this.metricProperties,
				metricValue: averageMS,
			});
			metric.success("Socket ping pong average latency");
		} else {
			Lumberjack.info(`${LumberEventName.SocketPingPong}`, {
				...this.metricProperties,
				durationInMs: averageMS,
			});
		}
	}
}
