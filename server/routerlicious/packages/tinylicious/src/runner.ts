/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/server-common-utils";
import {
	Deferred,
	IDocumentStorage,
	IOrdererManager,
	ITenantManager,
	IWebServer,
	IWebServerFactory,
	MongoManager,
	DefaultMetricClient,
	IRunner,
} from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import * as winston from "winston";
import {
	configureWebSocketServices,
	ICollaborationSessionEvents,
} from "@fluidframework/server-lambdas";
import { TestClientManager } from "@fluidframework/server-test-utils";
import detect from "detect-port";
import * as app from "./app";

export class TinyliciousRunner implements IRunner {
	private server?: IWebServer;

	private runningDeferred?: Deferred<void>;

	constructor(
		private readonly serverFactory: IWebServerFactory,
		private readonly config: Provider,
		private readonly port: string | number,
		private readonly orderManager: IOrdererManager,
		private readonly tenantManager: ITenantManager,
		private readonly storage: IDocumentStorage,
		private readonly mongoManager: MongoManager,
		private readonly collaborationSessionEventEmitter?: TypedEventEmitter<ICollaborationSessionEvents>,
	) {}

	public async start(): Promise<void> {
		const version = process.env.npm_package_version;
		winston.info(`Starting tinylicious@${version}`);

		this.runningDeferred = new Deferred<void>();

		// Make sure provided port is unoccupied
		try {
			await this.ensurePortIsFree();
		} catch (e) {
			if (this.config.get("exitOnPortConflict")) {
				winston.info(e);
				return;
			}
			throw e;
		}

		const alfred = app.create(
			this.config,
			this.storage,
			this.mongoManager,
			this.collaborationSessionEventEmitter,
		);
		alfred.set("port", this.port);

		this.server = this.serverFactory.create(alfred);
		const httpServer = this.server.httpServer;
		if (!this.server.webSocketServer) {
			throw new Error("WebSocket server is not initialized");
		}

		configureWebSocketServices(
			this.server.webSocketServer /* webSocketServer */,
			this.orderManager /* orderManager */,
			this.tenantManager /* tenantManager */,
			this.storage /* storage */,
			new TestClientManager() /* clientManager */,
			new DefaultMetricClient() /* metricLogger */,
			winston /* logger */,
			undefined /* maxNumberOfClientsPerDocument */,
			undefined /* numberOfMessagesPerTrace */,
			undefined /* maxTokenLifetimeSec */,
			undefined /* isTokenExpiryEnabled */,
			undefined /* isClientConnectivityCountingEnabled */,
			undefined /* isSignalUsageCountingEnabled */,
			undefined /* cache */,
			undefined /* connectThrottlerPerTenant */,
			undefined /* connectThrottlerPerCluster */,
			undefined /* submitOpThrottler */,
			undefined /* submitSignalThrottler */,
			undefined /* throttleAndUsageStorageManager */,
			undefined /* verifyMaxMessageSize */,
			undefined /* socketTracker */,
			undefined /* revokedTokenChecker */,
			this.collaborationSessionEventEmitter /* collaborationSessionEventEmitter  */,
		);

		// Listen on provided port, on all network interfaces.
		httpServer.listen(this.port);
		httpServer.on("error", (error) => this.onError(error));
		httpServer.on("listening", () => this.onListening());

		return this.runningDeferred.promise;
	}

	public stop(): Promise<void> {
		if (this.server) {
			// Close the underlying server and then resolve the runner once closed
			this.server.close().then(
				() => {
					this.runningDeferred?.resolve();
				},
				(error) => {
					this.runningDeferred?.reject(error);
				},
			);
		} else {
			this.runningDeferred?.resolve();
		}

		return this.runningDeferred?.promise ?? Promise.resolve();
	}

	/**
	 * Ensure provided port is free
	 */
	private async ensurePortIsFree(): Promise<void> {
		// If port is a named pipe resolve immediately
		if (typeof this.port === "string") {
			return;
		}

		const freePort = await detect(this.port);
		if (this.port === freePort) {
			return;
		}

		throw new Error(`Port: ${this.port} is occupied. Try port: ${freePort}`);
	}

	/**
	 * Event listener for HTTP server "error" event.
	 */
	private onError(error) {
		if (error.syscall !== "listen") {
			throw error;
		}

		const bind = typeof this.port === "string" ? `Pipe ${this.port}` : `Port ${this.port}`;

		// Handle specific listen errors with friendly messages
		switch (error.code) {
			case "EACCES":
				this.runningDeferred?.reject(`${bind} requires elevated privileges`);
				break;
			case "EADDRINUSE":
				this.runningDeferred?.reject(`${bind} is already in use`);
				break;
			default:
				throw error;
		}
	}

	/**
	 * Event listener for HTTP server "listening" event.
	 */
	private onListening() {
		const addr = this.server?.httpServer?.address();
		const bind = typeof addr === "string" ? `pipe ${addr}` : `port ${addr?.port}`;
		winston.info(`Listening on ${bind}`);
	}
}
