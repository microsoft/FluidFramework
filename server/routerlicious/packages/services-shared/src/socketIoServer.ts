/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import * as http from "http";
import * as core from "@fluidframework/server-services-core";
import {
	BaseTelemetryProperties,
	Lumberjack,
	LumberEventName,
} from "@fluidframework/server-services-telemetry";
import { Namespace, Server, Socket, RemoteSocket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Adapter } from "socket.io-adapter";
import { IRedisClientConnectionManager } from "@fluidframework/server-services-utils";
import * as redisSocketIoAdapter from "./redisSocketIoAdapter";
import {
	SocketIORedisConnection,
	SocketIoRedisSubscriptionConnection,
} from "./socketIoRedisConnection";

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

	public emit(event: string, ...args: any[]) {
		this.socket.emit(event, ...args);
	}

	public emitToRoom(roomId: string, event: string, ...args: any[]) {
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
		private readonly socketIoConfig?: any,
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
		const sleep = async (timeMs: number) =>
			new Promise((resolve) => setTimeout(resolve, timeMs));

		if (this.socketIoConfig?.gracefulShutdownEnabled) {
			// Gradual disconnection of websocket connections
			const drainTime = this.socketIoConfig?.gracefulShutdownDrainTimeMs ?? 30000;
			const drainInterval = this.socketIoConfig?.gracefulShutdownDrainIntervalMs ?? 1000;
			if (drainTime > 0 && drainInterval > 0) {
				// Stop receiving new connections
				this.io.engine.use((_, res, __) => {
					res.status(503).send("Graceful Shutdown");
				});

				const connections = await this.io.fetchSockets();
				const connectionCount = connections.length;
				const telemetryProperties = {
					drainTime,
					drainInterval,
					connectionCount,
				};
				Lumberjack.info("Graceful disconnection started", telemetryProperties);
				const metricForTimeTaken = Lumberjack.newLumberMetric(
					LumberEventName.GracefulShutdown,
					telemetryProperties,
				);
				// total number of drains to run
				const totalDrains = Math.ceil(drainTime / drainInterval);
				// number of connections to disconnect per drain
				const connectionsToDisconnectPerDrain = Math.ceil(connectionCount / totalDrains);
				let done = false;
				const drainConnections = Array.from(connections.values());
				let n = 0;
				if (connectionsToDisconnectPerDrain > 0) {
					// start draining                let done = false;
					for (let i = 0; i < totalDrains; i++) {
						for (let j = 0; j < connectionsToDisconnectPerDrain; j++) {
							const connection: RemoteSocket<any, any> = drainConnections[n];
							if (!connection) {
								done = true;
								break;
							}
							try {
								connection.disconnect(true);
							} catch (e) {
								Lumberjack.error("Graceful disconnect exception", undefined, e);
							}
							n++;
						}
						if (done) {
							break;
						}
						Lumberjack.info("Graceful disconnect batch processed", {
							disconnectedSoFar: n + 1,
							connectionCount,
						});
						await sleep(drainInterval);
					}
				}
				if (n + 1 < connectionCount) {
					metricForTimeTaken.error(
						`Graceful shutdown finished incompletely. Missed ${
							connectionCount - n - 1
						} connections.`,
					);
				} else {
					metricForTimeTaken.success("Graceful shutdown finished");
					const reconnections = await this.io.fetchSockets();
					Lumberjack.info("Graceful shutdown. Closing last reconnected connections", {
						connectionsCount: reconnections.length,
					});
				}
			}
		}

		this.io.close();
		await sleep(3000); // Give time for any  disconnect handlers to execute before closing Redis resources
		await Promise.all([
			this.redisClientConnectionManagerForPub.getRedisClient().quit(),
			this.redisClientConnectionManagerForSub.getRedisClient().quit(),
		]);
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
	redisClientConnectionManagerForPub.addErrorHandler(
		undefined, // lumber properties
		"Error with Redis pub connection", // error message
	);

	redisClientConnectionManagerForSub.addErrorHandler(
		undefined, // lumber properties
		"Error with Redis sub connection", // error message
	);

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
		socketIoConfig,
	);
}
