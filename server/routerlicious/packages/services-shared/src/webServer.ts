/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import cluster from "cluster";
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
	constructor(public httpServer: HttpServer, public webSocketServer: core.IWebSocketServer) {}

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
 * - Allow configuring heartbeat interval and timeout
 * - Add more to the heartbeat, like CPU and Memory usage, with related process kill checks: process.cpuUsage() and process.memoryUsage()
 * - Allow configuring max number of spawned workers
 * - Gracefully kill workers with worker.disconnect(): https://nodejs.org/docs/latest-v16.x/api/cluster.html#workerdisconnect
 * - Add timeout for graceful worker shutdown: https://nodejs.org/docs/latest-v16.x/api/cluster.html#workerkillsignal
 * - Spawn new worker after killing a worker
 * - Add fork/listening timeouts: https://nodejs.org/docs/latest-v16.x/api/cluster.html#event-fork
 */

// TODO: Move all of this to a shared space and configure whether to use clustering or not
interface IWorkerMessage<T> {
	type: string;
	data?: T;
}
interface IWorkerHeartbeat extends IWorkerMessage<undefined> {
	type: "heartbeat";
	// TODO: Add relevant data to heartbeat message, like CPU usage, memory usage, etc.
	// See process.cpuUsage() and process.memoryUsage(). We could use these to pre-emptively kill runaway processes.
}
type WorkerMessage = IWorkerHeartbeat;

export class SocketIoClusterWebServerFactory implements core.IWebServerFactory {
	constructor(
		private readonly redisConfig: any,
		private readonly socketIoAdapterConfig?: any,
		private readonly httpServerConfig?: IHttpServerConfig,
		private readonly socketIoConfig?: any,
	) {}

	public create(requestListener: RequestListener): core.IWebServer {
		// TODO: move these to configs
		const heartbeatIntervalMs = 5000;
		const heartbeatTimeoutMs = 3 * heartbeatIntervalMs;
		if (cluster.isPrimary) {
			// Init Primary cluster thread
			Lumberjack.info(`Primary cluster process is running.`, { pid: process.pid });
			// Create a blank HTTP Server that will distribute incoming requests to worker nodes.
			const server = createAndConfigureHttpServer(undefined, undefined);
			const httpServer = new HttpServer(server);
			setupMaster(server, {
				loadBalancingMethod: "least-connection", // either "random", "round-robin" or "least-connection"
			});
			const numCPUs = availableParallelism();
			Lumberjack.info(`Spawning ${numCPUs} cluster workers.`);
			const lastHeartbeatMap: Record<string, number> = {};
			// Regularly kill stuck workers
			setInterval(() => {
				for (const [workerId, lastHeartbeat] of Object.entries(lastHeartbeatMap)) {
					if (lastHeartbeat < Date.now() - heartbeatTimeoutMs) {
						const worker = cluster.workers?.[workerId];
						Lumberjack.error(`Worker heartbeat timeout.`, { pid: worker?.process.pid });
						// TODO: Should we do a more graceful shutdown with worker.disconnect()?
						// https://nodejs.org/docs/latest-v16.x/api/cluster.html#workerdisconnect
						worker?.kill();
						// TODO: Add timeout for worker to exit gracefully?
						// https://nodejs.org/docs/latest-v16.x/api/cluster.html#workerkillsignal
						// TODO: delete worker from heartbeat map?
					}
				}
			}, heartbeatTimeoutMs);
			const spawnWorker = () => {
				const worker = cluster.fork();
				worker.on("message", (message: WorkerMessage) => {
					if (message.type === "heartbeat") {
						lastHeartbeatMap[worker.id.toString()] = Date.now();
						return;
					}
				});
			};
			for (let i = 0; i < numCPUs; i++) {
				spawnWorker();
			}

			// TODO: add fork/listening timeouts?
			// https://nodejs.org/docs/latest-v16.x/api/cluster.html#event-fork

			cluster.on("exit", (worker, code, signal) => {
				Lumberjack.info(`Worker died.`, { code, signal, pid: worker.process.pid });
				// TODO: spawn a new worker to replace dead worker?
			});

			return new WebServer(httpServer, null as unknown as core.IWebSocketServer);
		} else {
			// Init Worker cluster thread
			Lumberjack.info(`Worker process is running.`, { pid: process.pid });

			setInterval(() => {
				const heartbeatMsg: IWorkerHeartbeat = { type: "heartbeat" };
				process.send?.(heartbeatMsg);
			}, heartbeatIntervalMs);

			// Create the base HTTP server and register the provided request listener
			const server = createAndConfigureHttpServer(requestListener, this.httpServerConfig);
			const httpServer = new HttpServer(server);
			const socketIoServer = socketIo.create(
				this.redisConfig,
				server,
				this.socketIoAdapterConfig,
				this.socketIoConfig,
				setupWorker,
			);

			return new WebServer(httpServer, socketIoServer);
		}
	}
}

export class ClusterWebServerFactory implements core.IWebServerFactory {
	constructor(private readonly httpServerConfig?: IHttpServerConfig) {}

	public create(requestListener: RequestListener): core.IWebServer {
		// Create the base HTTP server and register the provided request listener
		const server = createAndConfigureHttpServer(requestListener, this.httpServerConfig);
		const httpServer = new HttpServer(server);

		return new WebServer(httpServer, null as unknown as core.IWebSocketServer);
	}
}
