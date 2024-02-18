/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import * as http from "http";
import * as util from "util";
import * as core from "@fluidframework/server-services-core";
import { BaseTelemetryProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import { Namespace, Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Adapter } from "socket.io-adapter";
import * as winston from "winston";
import * as redisSocketIoAdapter from "./redisSocketIoAdapter";
import {
	SocketIORedisConnection,
	SocketIoRedisSubscriptionConnection,
} from "./socketIoRedisConnection";
import { IRedisClientConnectionManager } from "./redisClientConnectionManager";

class SocketIoSocket implements core.IWebSocket {
	public get id(): string {
		return this.socket.id;
	}

	constructor(private readonly socket: Socket) {}

	public on(event: string, listener: (...args: any[]) => void) {
		this.socket.on(event, listener);
	}

	public async join(id: string): Promise<void> {
		return this.socket.join(id);
	}

	public async emit(event: string, ...args: any[]) {
		this.socket.emit(event, ...args);
	}

	public async emitToRoom(roomId: string, event: string, ...args: any[]) {
		this.socket.nsp.to(roomId).emit(event, ...args);
	}

	public disconnect(close?: boolean) {
		this.socket.disconnect(close);
	}
}

/**
 * From https://socket.io/docs/v4/server-api/#event-connection_error
 */
interface ISocketIoConnectionError extends Error {
	code: number;
	message: string;
	req: http.IncomingMessage;
	context: any;
}
function isSocketIoConnectionError(error: unknown): error is ISocketIoConnectionError {
	return (
		error !== undefined &&
		typeof (error as ISocketIoConnectionError).code == "number" &&
		typeof (error as ISocketIoConnectionError).message == "string" &&
		typeof (error as ISocketIoConnectionError).req == "object"
	);
}

class SocketIoServer implements core.IWebSocketServer {
	private readonly events = new EventEmitter();

	constructor(
		private readonly io: Server,
		private readonly redisClientConnectionManagerForPub: IRedisClientConnectionManager,
		private readonly redisClientConnectionManagerForSub: IRedisClientConnectionManager,
	) {
		this.io.on("connection", (socket: Socket) => {
			const webSocket = new SocketIoSocket(socket);
			this.events.emit("connection", webSocket);

			// Server side listening for ping events
			socket.on("ping", (cb) => {
				if (typeof cb === "function") {
					cb();
				}
			});
		});
		this.io.engine.on("connection_error", (error) => {
			if (isSocketIoConnectionError(error) && error.req.url !== undefined) {
				const telemetryProperties: Record<string, any> = {
					reason: JSON.stringify({ code: error.code, message: error.message }), // e.g. { code: 1, message: "Session ID unknown" }
				};
				// req.url can be just "/socket.io/?documentId=..." without protocol or host.
				// We can prepend a dummy protocol+host in those situations since we only care about parsing query string.
				const urlString = error.req.url.startsWith("/")
					? `http://alfred:3000${error.req.url}`
					: error.req.url;
				try {
					const url = new URL(urlString);
					telemetryProperties.protocolVersion = url.searchParams.get("EIO"); // '2', '3', or '4'
					telemetryProperties.transport = url.searchParams.get("transport"); // 'websocket' or 'polling'
					telemetryProperties[BaseTelemetryProperties.tenantId] =
						url.searchParams.get("tenantId") ?? "";
					telemetryProperties[BaseTelemetryProperties.documentId] =
						url.searchParams.get("documentId") ?? "";
				} catch (e) {
					Lumberjack.error(
						"Unable to parse connection_error req.url",
						{
							...telemetryProperties,
							url: urlString,
						},
						e,
					);
				}
				Lumberjack.error("Socket.io Connection Error", telemetryProperties, error);
			}
		});
	}

	public on(event: string, listener: (...args: any[]) => void) {
		this.events.on(event, listener);
	}

	public async close(): Promise<void> {
		// eslint-disable-next-line @typescript-eslint/promise-function-async
		const pubClosedP = util.promisify(((callback) =>
			this.redisClientConnectionManagerForPub.getRedisClient().quit(callback)) as any)();
		// eslint-disable-next-line @typescript-eslint/promise-function-async
		const subClosedP = util.promisify(((callback) =>
			this.redisClientConnectionManagerForSub.getRedisClient().quit(callback)) as any)();
		const ioClosedP = util.promisify(((callback) => this.io.close(callback)) as any)();
		await Promise.all([pubClosedP, subClosedP, ioClosedP]);
	}
}

export function create(
	redisClientConnectionManagerForPub: IRedisClientConnectionManager,
	redisClientConnectionManagerForSub: IRedisClientConnectionManager,
	server: http.Server,
	socketIoAdapterConfig?: any,
	socketIoConfig?: any,
	ioSetup?: (io: Server) => void,
): core.IWebSocketServer {
	redisClientConnectionManagerForPub.getRedisClient().on("error", (err) => {
		winston.error("[DHRUV DEBUG] Error with Redis pub connection: ", err);
		Lumberjack.error("[DHRUV DEBUG] Error with Redis pub connection", undefined, err);
	});
	redisClientConnectionManagerForSub.getRedisClient().on("error", (err) => {
		winston.error("[DHRUV DEBUG] Error with Redis sub connection: ", err);
		Lumberjack.error("[DHRUV DEBUG] Error with Redis sub connection", undefined, err);
	});

	let adapter: (nsp: Namespace) => Adapter;
	if (socketIoAdapterConfig?.enableCustomSocketIoAdapter) {
		const socketIoRedisOptions: redisSocketIoAdapter.ISocketIoRedisOptions = {
			pubConnection: new SocketIORedisConnection(redisClientConnectionManagerForPub),
			subConnection: new SocketIoRedisSubscriptionConnection(
				redisClientConnectionManagerForSub,
			),
		};

		redisSocketIoAdapter.RedisSocketIoAdapter.setup(
			socketIoRedisOptions,
			socketIoAdapterConfig?.shouldDisableDefaultNamespace,
		);

		adapter = redisSocketIoAdapter.RedisSocketIoAdapter as any;
	} else {
		adapter = createAdapter(
			redisClientConnectionManagerForPub.getRedisClient(),
			redisClientConnectionManagerForSub.getRedisClient(),
		);
	}

	// Create and register a socket.io connection on the server
	const io = new Server(server, {
		// Enable compatibility with socket.io v2 clients
		allowEIO3: true,
		// Indicates whether a connection should use compression
		perMessageDeflate: socketIoConfig?.perMessageDeflate ?? true,
		// Enable long-polling as a fallback
		transports: ["websocket", "polling"],
		cors: {
			// Explicitly allow all origins by reflecting request origin.
			// As a service that has potential to host countless different client apps,
			// it would impossible to hardcode or configure restricted CORS policies.
			origin: true,
			credentials: true,
		},
		adapter,
	});
	if (ioSetup !== undefined) {
		ioSetup(io);
	}

	return new SocketIoServer(
		io,
		redisClientConnectionManagerForPub,
		redisClientConnectionManagerForSub,
	);
}
