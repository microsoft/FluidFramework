/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import cluster from "cluster";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
	Deferred,
	ICache,
	IClientManager,
	IClusterDrainingChecker,
	IDocumentStorage,
	IOrdererManager,
	IRunner,
	ITenantManager,
	IThrottler,
	IThrottleAndUsageStorageManager,
	IWebServer,
	IWebServerFactory,
	ITokenRevocationManager,
	IWebSocketTracker,
	IRevokedTokenChecker,
	ICollaborationSessionTracker,
	IReadinessCheck,
} from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import * as winston from "winston";
import { createMetricClient } from "@fluidframework/server-services";
import { LumberEventName, Lumberjack, LogLevel } from "@fluidframework/server-services-telemetry";
import {
	configureWebSocketServices,
	ICollaborationSessionEvents,
} from "@fluidframework/server-lambdas";
import * as app from "./app";
import { runnerHttpServerStop } from "@fluidframework/server-services-shared";

export class NexusRunner implements IRunner {
	private server?: IWebServer;
	private runningDeferred?: Deferred<void>;
	private stopped: boolean = false;
	private readonly runnerMetric = Lumberjack.newLumberMetric(LumberEventName.NexusRunner);

	constructor(
		private readonly serverFactory: IWebServerFactory,
		private readonly config: Provider,
		private readonly port: string | number,
		private readonly orderManager: IOrdererManager,
		private readonly tenantManager: ITenantManager,
		private readonly socketConnectTenantThrottler: IThrottler,
		private readonly socketConnectClusterThrottler: IThrottler,
		private readonly socketSubmitOpThrottler: IThrottler,
		private readonly socketSubmitSignalThrottler: IThrottler,
		private readonly storage: IDocumentStorage,
		private readonly clientManager: IClientManager,
		private readonly metricClientConfig: any,
		private readonly startupCheck: IReadinessCheck,
		private readonly throttleAndUsageStorageManager?: IThrottleAndUsageStorageManager,
		private readonly verifyMaxMessageSize?: boolean,
		private readonly redisCache?: ICache,
		private readonly socketTracker?: IWebSocketTracker,
		private readonly tokenRevocationManager?: ITokenRevocationManager,
		private readonly revokedTokenChecker?: IRevokedTokenChecker,
		private readonly collaborationSessionEventEmitter?: TypedEventEmitter<ICollaborationSessionEvents>,
		private readonly clusterDrainingChecker?: IClusterDrainingChecker,
		private readonly collaborationSessionTracker?: ICollaborationSessionTracker,
		private readonly readinessCheck?: IReadinessCheck,
	) {}

	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public start(): Promise<void> {
		this.runningDeferred = new Deferred<void>();

		// Create an HTTP server with a request listener for health endpoints.
		const nexus = app.create(this.config, this.startupCheck, this.readinessCheck);
		nexus.set("port", this.port);
		this.server = this.serverFactory.create(nexus);

		const usingClusterModule: boolean | undefined = this.config.get("nexus:useNodeCluster");
		// Don't include application logic in primary thread when Node.js cluster module is enabled.
		const includeAppLogic = !(cluster.isPrimary && usingClusterModule);

		if (includeAppLogic) {
			const maxNumberOfClientsPerDocument = this.config.get(
				"nexus:maxNumberOfClientsPerDocument",
			);
			const numberOfMessagesPerTrace = this.config.get("nexus:numberOfMessagesPerTrace");
			const maxTokenLifetimeSec = this.config.get("auth:maxTokenLifetimeSec");
			const isTokenExpiryEnabled = this.config.get("auth:enableTokenExpiration");
			const isClientConnectivityCountingEnabled = this.config.get(
				"usage:clientConnectivityCountingEnabled",
			);
			const isSignalUsageCountingEnabled = this.config.get(
				"usage:signalUsageCountingEnabled",
			);

			if (!this.server.webSocketServer) {
				throw new Error("WebSocket server is not initialized");
			}

			// Register all the socket.io stuff
			configureWebSocketServices(
				this.server.webSocketServer,
				this.orderManager,
				this.tenantManager,
				this.storage,
				this.clientManager,
				createMetricClient(this.metricClientConfig),
				winston,
				maxNumberOfClientsPerDocument,
				numberOfMessagesPerTrace,
				maxTokenLifetimeSec,
				isTokenExpiryEnabled,
				isClientConnectivityCountingEnabled,
				isSignalUsageCountingEnabled,
				this.redisCache,
				this.socketConnectTenantThrottler,
				this.socketConnectClusterThrottler,
				this.socketSubmitOpThrottler,
				this.socketSubmitSignalThrottler,
				this.throttleAndUsageStorageManager,
				this.verifyMaxMessageSize,
				this.socketTracker,
				this.revokedTokenChecker,
				this.collaborationSessionEventEmitter,
				this.clusterDrainingChecker,
				this.collaborationSessionTracker,
			);

			if (this.tokenRevocationManager) {
				this.tokenRevocationManager.start().catch((error) => {
					// Prevent service crash if token revocation manager fails to start
					Lumberjack.error("Failed to start token revocation manager.", undefined, error);
				});
			}
		}

		const httpServer = this.server.httpServer;
		httpServer.on("error", (error) => this.onError(error));
		httpServer.on("listening", () => this.onListening());
		httpServer.on("upgrade", (req, socket, initialMsgBuffer) =>
			this.setupConnectionMetricOnUpgrade(req, socket, initialMsgBuffer),
		);
		// Listen on primary thread port, on all network interfaces,
		// or allow cluster module to assign random port for worker thread.
		httpServer.listen(cluster.isPrimary ? this.port : 0);

		this.stopped = false;

		if (this.startupCheck.setReady) {
			this.startupCheck.setReady();
		}
		return this.runningDeferred.promise;
	}

	public async stop(caller?: string, uncaughtException?: any): Promise<void> {
		if (this.stopped) {
			Lumberjack.info("NexusRunner.stop already called, returning early.");
			return;
		}
		this.stopped = true;
		Lumberjack.info("NexusRunner.stop starting.");

		const runnerServerCloseTimeoutMs =
			this.config.get("shared:runnerServerCloseTimeoutMs") ?? 30000;

		await runnerHttpServerStop(
			this.server,
			this.runningDeferred,
			runnerServerCloseTimeoutMs,
			this.runnerMetric,
			caller,
			uncaughtException,
		);
	}

	/**
	 * Event listener for HTTP server "error" event.
	 */
	private onError(error) {
		if (!this.runnerMetric.isCompleted()) {
			this.runnerMetric.error(
				`${this.runnerMetric.eventName} encountered an error in http server`,
				error,
			);
		}
		if (error.syscall !== "listen") {
			throw error;
		}

		const bind = typeof this.port === "string" ? `Pipe ${this.port}` : `Port ${this.port}`;

		// Handle specific listen errors with friendly messages
		switch (error.code) {
			case "EACCES":
				this.runningDeferred?.reject(`${bind} requires elevated privileges`);
				this.runningDeferred = undefined;
				break;
			case "EADDRINUSE":
				this.runningDeferred?.reject(`${bind} is already in use`);
				this.runningDeferred = undefined;
				break;
			default:
				throw error;
		}
	}

	/**
	 * Handles the on "upgrade" event to setup connection count telemetry. This telemetry is updated
	 * on all socket events: "upgrade", "close", "error".
	 */
	private setupConnectionMetricOnUpgrade(req, socket, initialMsgBuffer) {
		const metric = Lumberjack.newLumberMetric(LumberEventName.SocketConnectionCount, {
			origin: "upgrade",
			metricValue: socket.server._connections,
		});
		metric.success("WebSockets: connection upgraded");
		socket.on("close", (hadError: boolean) => {
			const closeMetric = Lumberjack.newLumberMetric(LumberEventName.SocketConnectionCount, {
				origin: "close",
				metricValue: socket.server._connections,
				hadError: hadError.toString(),
			});
			closeMetric.success(
				"WebSockets: connection closed",
				hadError ? LogLevel.Error : LogLevel.Info,
			);
		});
		socket.on("error", (error) => {
			const errorMetric = Lumberjack.newLumberMetric(LumberEventName.SocketConnectionCount, {
				origin: "error",
				metricValue: socket.server._connections,
				bytesRead: socket.bytesRead,
				bytesWritten: socket.bytesWritten,
				error: error.toString(),
			});
			// We only care about the connections parameter which is already calculated.
			// Leaving as success to avoid confusion if someone see the metric decreasing.
			errorMetric.success("WebSockets: connection error", LogLevel.Error);
		});
	}

	/**
	 * Event listener for HTTP server "listening" event.
	 */
	private onListening() {
		const addr = this.server?.httpServer?.address();
		const bind = typeof addr === "string" ? `pipe ${addr}` : `port ${addr?.port}`;
		winston.info(`Listening on ${bind}`);
		Lumberjack.info(`Listening on ${bind}`);
	}
}
