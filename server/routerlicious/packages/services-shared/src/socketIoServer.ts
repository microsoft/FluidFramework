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
import { IRedisClientConnectionManager } from "@fluidframework/server-services-utils";
import { Namespace, Server, Socket, RemoteSocket, type DisconnectReason } from "socket.io";
import { createAdapter as createRedisAdapter } from "@socket.io/redis-adapter";
import type { Adapter } from "socket.io-adapter";
import type { Cluster, Redis } from "ioredis";
import * as redisSocketIoAdapter from "./redisSocketIoAdapter";
import {
	SocketIORedisConnection,
	SocketIoRedisSubscriptionConnection,
} from "./socketIoRedisConnection";
import { performance } from "perf_hooks";

class SocketIoSocket implements core.IWebSocket {
	private readonly eventListeners: { event: string; listener: () => void }[] = [];

	private isDisposed = false;

	public get id(): string {
		return this.socket.id;
	}

	constructor(private readonly socket: Socket) {}

	public get handshake(): any {
		return this.socket.handshake;
	}

	public on(event: string, listener: (...args: any[]) => void) {
		if (!this.isDisposed) {
			this.eventListeners.push({ event, listener });
			this.socket.on(event, listener);
		}
	}

	public async join(id: string): Promise<void> {
		if (!this.isDisposed) {
			return this.socket.join(id);
		}
	}

	public emit(event: string, ...args: any[]) {
		if (!this.isDisposed) {
			this.socket.emit(event, ...args);
		}
	}

	public emitToRoom(roomId: string, event: string, ...args: any[]) {
		if (!this.isDisposed) {
			this.socket.nsp.to(roomId).emit(event, ...args);
		}
	}

	public disconnect(close?: boolean) {
		if (!this.isDisposed) {
			this.socket.disconnect(close);
		}
	}

	public dispose(): void {
		this.isDisposed = true;
		if (!this.socket.disconnected) {
			this.disconnect(true);
		}
		for (const { event, listener } of this.eventListeners) {
			this.socket.off(event, listener);
		}
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

export interface ISocketIoServerConfig {
	/**
	 * Whether to enable "Graceful Shutdown" feature.
	 * When set to `true`, before closing the server will stop receiving new connections and
	 * gradually disconnect existing connections.
	 */
	gracefulShutdownEnabled: boolean;
	/**
	 * The time in milliseconds to fit all graceful disconnects into.
	 * A shorter time will result in faster disconnection of all connections.
	 * Default is 30 seconds.
	 */
	gracefulShutdownDrainTimeMs: number;
	/**
	 * The time in milliseconds to wait between each batch of disconnections.
	 * Default is 1 second.
	 */
	gracefulShutdownDrainIntervalMs: number;
	/**
	 * Whether to enable ping-pong latency tracking.
	 * When set to `true`, the internal Socket.io Ping-Pong mechanism will be used to track latency.
	 */
	pingPongLatencyTrackingEnabled: boolean;
	/**
	 * The number of ping pong events to aggregate for each ping-pong latency telemetry event.
	 * This is tracked on a per socket connection level.
	 * Default is 3.
	 */
	pingPongLatencyTrackingAggregationThreshold: number;
	/**
	 * Whether to enable Socket.io [perMessageDeflate](https://socket.io/docs/v4/server-options/#permessagedeflate) option.
	 * Default is `true`.
	 */
	perMessageDeflate: boolean;
}

class SocketIoServer implements core.IWebSocketServer {
	private readonly events = new EventEmitter();
	private readonly pingPongLatencyTrackingAggregationThreshold: number = 3;

	constructor(
		private readonly io: Server,
		private readonly redisClientConnectionManagerForPub: IRedisClientConnectionManager,
		private readonly redisClientConnectionManagerForSub: IRedisClientConnectionManager,
		private readonly socketIoConfig?: Partial<ISocketIoServerConfig>,
	) {
		this.io.on("connection", (socket: Socket) => {
			/**
			 * Fluid Socket.io connection URL looks like:
			 * "<hostname>/socket.io/?documentId=[documentId]&tenantId=[tenantId]&EIO=[3/4]&transport=[websocket/polling]"
			 * [socket.handshake.query](https://socket.io/docs/v4/server-socket-instance/#sockethandshake) contains parsed query params.
			 * The following properties are used for **telemetry purposes only.**
			 * These should **not** be used to identify the tenant and document associated with the socket connection
			 * for real logic and access purposes without validating against the JWT access token.
			 */
			const telemetryProperties = {
				[BaseTelemetryProperties.tenantId]: `${socket.handshake.query.tenantId}`,
				[BaseTelemetryProperties.documentId]: `${socket.handshake.query.documentId}`,
			};
			const socketConnectionMetric = Lumberjack.newLumberMetric(
				LumberEventName.SocketConnection,
				telemetryProperties,
			);
			const webSocket = new SocketIoSocket(socket);
			this.events.emit("connection", webSocket);

			this.initPingPongLatencyTracking(socket, telemetryProperties);

			webSocket.on("disconnect", (reason: DisconnectReason) => {
				// The following should be considered as normal disconnects and not logged as errors.
				// For more information about each reason, see https://socket.io/docs/v4/server-socket-instance/#disconnect
				const isOk = [
					// server used socket.disconnect()
					"server namespace disconnect",
					// client used socket.disconnect()
					"client namespace disconnect",
					// server shutting down
					"server shutting down",
					// connection closed for normal reasons
					"transport close",
				].includes(reason);
				socketConnectionMetric.setProperties({
					reason,
					transport: socket.conn.transport.name,
				});
				if (isOk) {
					socketConnectionMetric.success("Socket connection ended");
				} else {
					socketConnectionMetric.error("Socket connection closed", reason);
				}
			});

			// Server side listening for ping events
			webSocket.on("ping", (cb) => {
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

		if (this.socketIoConfig?.pingPongLatencyTrackingAggregationThreshold !== undefined) {
			this.pingPongLatencyTrackingAggregationThreshold =
				this.socketIoConfig?.pingPongLatencyTrackingAggregationThreshold;
		}
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
					res.writeHead(503);
					res.end("Graceful Shutdown");
				});

				const connections = await this.io.local.fetchSockets();
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
					const reconnections = await this.io.local.fetchSockets();
					Lumberjack.info("Graceful shutdown. Closing last reconnected connections", {
						connectionsCount: reconnections.length,
					});
				}
			}
		}

		await this.io.close();
		// Give time for any disconnect handlers to execute before closing Redis resources
		// Note: on 2024-10-18, with the update to socket.io@4.8.0, the close() call above became async.
		// Maybe this sleep can be removed now? Not familiar enough with server to try to do it.
		// See https://github.com/socketio/socket.io/pull/4971 for details on the change.
		await sleep(3000);
		await Promise.all([
			this.redisClientConnectionManagerForPub.getRedisClient().quit(),
			this.redisClientConnectionManagerForSub.getRedisClient().quit(),
		]);
	}

	private initPingPongLatencyTracking(
		socket: Socket,
		{ tenantId, documentId }: { tenantId: string; documentId: string },
	) {
		if (!this.socketIoConfig?.pingPongLatencyTrackingEnabled) {
			return;
		}

		const pingPongDurationsMs: number[] = [];
		const outputPingPongLatencyEvent = () => {
			const aggregateAverageLatencyMs = Math.ceil(
				pingPongDurationsMs.reduce((a, b) => a + b) / pingPongDurationsMs.length,
			);
			pingPongDurationsMs.length = 0;
			const latencyMetric = Lumberjack.newLumberMetric(
				LumberEventName.SocketConnectionLatency,
				{
					[BaseTelemetryProperties.tenantId]: tenantId,
					[BaseTelemetryProperties.documentId]: documentId,
					durationInMs: aggregateAverageLatencyMs,
				},
			);
			// Always successful
			latencyMetric.success("Socket.io Ping-Pong Latency");
		};
		let lastPingStartTime: number | undefined;
		const packetCreateHandler = (packet: any) => {
			if (packet.type === "ping") {
				lastPingStartTime = performance.now();
			}
		};
		socket.conn.on("packetCreate", packetCreateHandler);
		const packetReceivedHandler = (packet: any) => {
			if (packet.type === "pong" && lastPingStartTime !== undefined) {
				const latency = performance.now() - lastPingStartTime;
				lastPingStartTime = undefined;
				pingPongDurationsMs.push(latency);
				// Output telemetry when threshold is reached
				if (
					pingPongDurationsMs.length >= this.pingPongLatencyTrackingAggregationThreshold
				) {
					outputPingPongLatencyEvent();
				}
			}
		};
		socket.conn.on("packet", packetReceivedHandler);
		socket.conn.on("close", () => {
			if (pingPongDurationsMs.length > 0) {
				outputPingPongLatencyEvent();
			}
			socket.conn.off("packetCreate", packetCreateHandler);
			socket.conn.off("packet", packetReceivedHandler);
		});
	}
}

type SocketIoAdapter = typeof Adapter | ((nsp: Namespace) => Adapter);

/**
 * @internal
 */
export type SocketIoAdapterCreator = (
	pub: Redis | Cluster,
	sub: Redis | Cluster,
) => SocketIoAdapter;

function getRedisAdapter(
	redisClientConnectionManagerForPub: IRedisClientConnectionManager,
	redisClientConnectionManagerForSub: IRedisClientConnectionManager,
	socketIoAdapterConfig?: any,
	customCreateAdapter?: SocketIoAdapterCreator,
): SocketIoAdapter {
	if (customCreateAdapter !== undefined) {
		// Use the externally provided Socket.io Adapter
		return customCreateAdapter(
			redisClientConnectionManagerForPub.getRedisClient(),
			redisClientConnectionManagerForSub.getRedisClient(),
		);
	}

	if (socketIoAdapterConfig?.enableCustomSocketIoAdapter) {
		// Use the custom Socket.io Redis Adapter from the services-shared package
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

		return redisSocketIoAdapter.RedisSocketIoAdapter;
	}

	// Use the default, official Socket.io Redis Adapter from the @socket.io/redis-adapter package
	return createRedisAdapter(
		redisClientConnectionManagerForPub.getRedisClient(),
		redisClientConnectionManagerForSub.getRedisClient(),
	);
}

export function create(
	redisClientConnectionManagerForPub: IRedisClientConnectionManager,
	redisClientConnectionManagerForSub: IRedisClientConnectionManager,
	server: http.Server,
	socketIoAdapterConfig?: any,
	socketIoConfig?: ISocketIoServerConfig,
	ioSetup?: (io: Server) => void,
	customCreateAdapter?: SocketIoAdapterCreator,
): core.IWebSocketServer {
	redisClientConnectionManagerForPub.addErrorHandler(
		undefined, // lumber properties
		"Error with Redis pub connection", // error message
	);

	redisClientConnectionManagerForSub.addErrorHandler(
		undefined, // lumber properties
		"Error with Redis sub connection", // error message
	);
	const adapter = getRedisAdapter(
		redisClientConnectionManagerForPub,
		redisClientConnectionManagerForSub,
		socketIoAdapterConfig,
		customCreateAdapter,
	);

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
