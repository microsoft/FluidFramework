/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import cluster, { Worker } from "cluster";
// Note: `availableParallelism` Node 18 is required for this functionality
import { availableParallelism } from "os";
import * as http from "http";
import { AddressInfo } from "net";
import * as util from "util";
import * as core from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { setupMaster, setupWorker } from "@socket.io/sticky";
import * as socketIo from "./socketIoServer";

export type RequestListener = (
	request: http.IncomingMessage,
	response: http.ServerResponse,
) => void;

export class HttpServer implements core.IHttpServer {
	constructor(private readonly server: http.Server) {}

	public async close(): Promise<void> {
		await util.promisify(((callback) => this.server.close(callback)) as any)();
	}

	public listen(port: any) {
		this.server.listen(port);
	}

	public on(event: string, listener: (...args: any[]) => void) {
		this.server.on(event, listener);
	}

	public address(): AddressInfo {
		return this.server.address() as AddressInfo;
	}
}

export class WebServer implements core.IWebServer {
	constructor(
		public httpServer: HttpServer,
		public webSocketServer: core.IWebSocketServer,
	) {}

	/**
	 * Closes the web server
	 */
	public async close(): Promise<void> {
		// Since httpServer is reused in webSocketServer, only need to shutdown webSocketServer.
		await (this.webSocketServer ? this.webSocketServer.close() : this.httpServer.close());
	}
}

export interface IHttpServerConfig {
	/**
	 * The number of milliseconds of inactivity before a socket is presumed to have timed out.
	 * A value of 0 will disable the timeout behavior on incoming connections.
	 * Default: 0 (disabled)
	 */
	connectionTimeoutMs: number;
}

const defaultHttpServerConfig: IHttpServerConfig = {
	connectionTimeoutMs: 0,
};
const createAndConfigureHttpServer = (
	requestListener: RequestListener | undefined,
	httpServerConfig: Partial<IHttpServerConfig> | undefined,
): http.Server => {
	const server = http.createServer(requestListener);
	server.timeout =
		httpServerConfig?.connectionTimeoutMs ?? defaultHttpServerConfig.connectionTimeoutMs;
	return server;
};

export class SocketIoWebServerFactory implements core.IWebServerFactory {
	constructor(
		private readonly redisConfig: any,
		private readonly socketIoAdapterConfig?: any,
		private readonly httpServerConfig?: IHttpServerConfig,
		private readonly socketIoConfig?: any,
	) {}

	public create(requestListener: RequestListener): core.IWebServer {
		// Create the base HTTP server and register the provided request listener
		const server = createAndConfigureHttpServer(requestListener, this.httpServerConfig);
		const httpServer = new HttpServer(server);

		const socketIoServer = socketIo.create(
			this.redisConfig,
			server,
			this.socketIoAdapterConfig,
			this.socketIoConfig,
		);

		return new WebServer(httpServer, socketIoServer);
	}
}

export class BasicWebServerFactory implements core.IWebServerFactory {
	constructor(private readonly httpServerConfig?: IHttpServerConfig) {}

	public create(requestListener: RequestListener): core.IWebServer {
		// Create the base HTTP server and register the provided request listener
		const server = createAndConfigureHttpServer(requestListener, this.httpServerConfig);
		const httpServer = new HttpServer(server);

		return new WebServer(httpServer, null as unknown as core.IWebSocketServer);
	}
}

/**
 * Node.js Clustering POC.
 * TODO:
 * - Add more to the heartbeat, like CPU and Memory usage, with related process kill checks: process.cpuUsage() and process.memoryUsage()
 */

interface IWorkerMessage<T> {
	type: string;
	data?: T;
}
interface IWorkerHeartbeatMessage extends IWorkerMessage<undefined> {
	type: "heartbeat";
	// TODO: Add relevant data to heartbeat message, like CPU usage, memory usage, etc.
	// See process.cpuUsage() and process.memoryUsage(). We could use these to pre-emptively kill runaway processes.
}
interface IWorkerShutdownMessage extends IWorkerMessage<undefined> {
	type: "shutdown";
}
export interface INodeClusterConfig {
	workerHeartbeatIntervalMs: number;
	workerTimeoutNumMissedHeartbeats: number;
	workerForkTimeoutMs: number;
	numMaxWorkers: number;
}
type WorkerMessage = IWorkerHeartbeatMessage | IWorkerShutdownMessage;

export class NodeClusterWebServerFactory implements core.IWebServerFactory {
	private readonly lastHeartbeatMap: Map<number, number> = new Map();
	private readonly newForkTimeouts: Map<number, NodeJS.Timeout> = new Map();
	private readonly disconnectTimeouts: Map<number, NodeJS.Timeout> = new Map();
	private readonly heartbeatIntervalMs: number;

	constructor(
		private readonly httpServerConfig?: IHttpServerConfig,
		private readonly clusterConfig?: Partial<INodeClusterConfig>,
	) {
		this.heartbeatIntervalMs = this.clusterConfig?.workerHeartbeatIntervalMs ?? 5000;
	}

	public create(requestListener: RequestListener): core.IWebServer {
		const httpServer = cluster.isPrimary
			? this.initializePrimaryThread()
			: this.initializeWorkerThread(requestListener);

		return new WebServer(new HttpServer(httpServer), null as unknown as core.IWebSocketServer);
	}

	protected initializePrimaryThread(
		additionalServerSetup?: (server: http.Server) => void,
	): http.Server {
		// Init Primary cluster thread
		Lumberjack.info(`Primary cluster process is running.`, { pid: process.pid });

		// Create a blank HTTP Server that will distribute incoming requests to worker nodes.
		const server = createAndConfigureHttpServer(undefined, undefined);
		additionalServerSetup?.(server);

		// Regularly kill stuck workers
		const heartbeatTimeoutMs =
			(this.clusterConfig?.workerTimeoutNumMissedHeartbeats ?? 3) * this.heartbeatIntervalMs;
		setInterval(() => {
			for (const [workerId, lastHeartbeat] of this.lastHeartbeatMap.entries()) {
				const msSinceLastHeartbeat = Date.now() - lastHeartbeat;
				if (msSinceLastHeartbeat >= heartbeatTimeoutMs) {
					const worker = cluster.workers?.[workerId];
					if (!worker) {
						Lumberjack.error("Could not find worker after heartbeat timeout.", {
							id: workerId,
						});
						return;
					}
					Lumberjack.error(`Worker heartbeat timeout.`, {
						pid: worker?.process.pid,
						msSinceLastHeartbeat,
					});
					this.killWorker(worker);
				}
			}
		}, heartbeatTimeoutMs);

		// Spawn initial number of workers according to configs or available CPUs
		const numWorkers = this.clusterConfig?.numMaxWorkers ?? availableParallelism();
		Lumberjack.info(`Spawning ${numWorkers} cluster workers.`);
		for (let i = 0; i < numWorkers; i++) {
			this.spawnWorker();
		}

		// Kill workers when they take too long to spawn.
		cluster.on("fork", (worker) => {
			const timeout = setTimeout(
				() => {
					Lumberjack.error("Timed out waiting for worker to spawn.", {
						id: worker.id,
						pid: worker.process.pid,
					});

					// Make sure worker dies.
					this.killWorker(worker);

					// Remove timeout from map.
					this.newForkTimeouts.delete(worker.id);
				},
				this.clusterConfig?.workerForkTimeoutMs,
			);
			this.newForkTimeouts.set(worker.id, timeout);
		});
		cluster.on("listening", (worker, address) => {
			clearTimeout(this.newForkTimeouts.get(worker.id));
			this.newForkTimeouts.delete(worker.id);
		});

		// Listen for exiting workers.
		cluster.on("exit", (worker, code, signal) => {
			const logLevel = signal || code !== 0 ? "error" : "info";
			Lumberjack[logLevel](`Worker died.`, {
				code,
				signal,
				pid: worker.process.pid,
				id: worker.id,
			});

			// Clear timeout trackers
			this.lastHeartbeatMap.delete(worker.id);
			clearTimeout(this.newForkTimeouts.get(worker.id));
			this.newForkTimeouts.delete(worker.id);
			clearTimeout(this.disconnectTimeouts.get(worker.id));
			this.disconnectTimeouts.delete(worker.id);

			// Spawn a new worker to replace dead worker if died due to error.
			if (logLevel === "error") {
				Lumberjack.info(`Spawning new worker to replace dead worker.`);
				this.spawnWorker();
			}
		});

		return server;
	}

	protected initializeWorkerThread(requestListener: RequestListener): http.Server {
		// Init Worker cluster thread
		Lumberjack.info(`Worker process is running.`, { pid: process.pid });

		// Send a heartbeat message on an interval
		setInterval(() => {
			const heartbeatMsg: IWorkerHeartbeatMessage = { type: "heartbeat" };
			process.send?.(heartbeatMsg);
		}, this.heartbeatIntervalMs);

		// Create the base HTTP server and register the provided request listener
		const server = createAndConfigureHttpServer(requestListener, this.httpServerConfig);

		// Handle messages from primary thread in worker thread.
		process.on("message", (message: WorkerMessage) => {
			if (message.type === "shutdown") {
				server.closeAllConnections();
			}
		});

		return server;
	}

	protected spawnWorker(): Worker {
		const worker = cluster.fork();
		// Handle messages from worker thread in primary thread
		worker.on("message", (message: WorkerMessage) => {
			if (message.type === "heartbeat") {
				this.lastHeartbeatMap.set(worker.id, Date.now());
				return;
			}
		});
		return worker;
	}

	protected killWorker(worker: Worker): void {
		Lumberjack.info("Killing worker.", {
			id: worker.id,
			pid: worker.process.pid,
		});

		// Attempt to gracefully shutdown the worker.
		const shutdownMessage: IWorkerShutdownMessage = { type: "shutdown" };
		worker.send(shutdownMessage);
		worker.disconnect();
		// Forcefully kill the worker if it takes too long to gracefully close.
		const disconnectTimeout = setTimeout(() => {
			worker.kill();
		}, 2000);
		this.disconnectTimeouts.set(worker.id, disconnectTimeout);
		worker.on("disconnect", () => {
			clearTimeout(disconnectTimeout);
			this.disconnectTimeouts.delete(worker.id);
		});
	}
}

export class SocketIoNodeClusterWebServerFactory extends NodeClusterWebServerFactory {
	constructor(
		private readonly redisConfig: any,
		private readonly socketIoAdapterConfig?: any,
		httpServerConfig?: IHttpServerConfig,
		private readonly socketIoConfig?: any,
		clusterConfig?: Partial<INodeClusterConfig>,
	) {
		super(httpServerConfig, clusterConfig);
	}

	public create(requestListener: RequestListener): core.IWebServer {
		const httpServer = cluster.isPrimary
			? this.initializePrimaryThread((server) => {
					// Configure Socket.io Sticky load balancing
					setupMaster(server, {
						loadBalancingMethod: "least-connection", // either "random", "round-robin" or "least-connection"
					});
			  })
			: this.initializeWorkerThread(requestListener);
		if (cluster.isPrimary) {
			return new WebServer(
				new HttpServer(httpServer),
				null as unknown as core.IWebSocketServer,
			);
		} else {
			const socketIoServer = socketIo.create(
				this.redisConfig,
				httpServer,
				this.socketIoAdapterConfig,
				this.socketIoConfig,
				setupWorker,
			);
			return new WebServer(new HttpServer(httpServer), socketIoServer);
		}
	}
}
