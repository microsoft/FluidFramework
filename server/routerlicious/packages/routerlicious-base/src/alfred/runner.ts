/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@fluidframework/common-utils";
import {
	ICache,
	IClientManager,
	IDeltaService,
	IDocumentStorage,
	IOrdererManager,
	IProducer,
	IRunner,
	ITenantManager,
	IThrottler,
	IThrottleAndUsageStorageManager,
	IWebServer,
	IWebServerFactory,
	IDocumentRepository,
	ITokenRevocationManager,
	IWebSocketTracker,
	IRevokedTokenChecker,
} from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import * as winston from "winston";
import { createMetricClient } from "@fluidframework/server-services";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { LumberEventName, Lumberjack } from "@fluidframework/server-services-telemetry";
import { configureWebSocketServices } from "@fluidframework/server-lambdas";
import { runnerHttpServerStop } from "../utils";
import * as app from "./app";
import { IDocumentDeleteService } from "./services";

export class AlfredRunner implements IRunner {
	private server: IWebServer;
	private runningDeferred: Deferred<void>;
	private stopped: boolean = false;
	private readonly runnerMetric = Lumberjack.newLumberMetric(LumberEventName.AlfredRunner);

	constructor(
		private readonly serverFactory: IWebServerFactory,
		private readonly config: Provider,
		private readonly port: string | number,
		private readonly orderManager: IOrdererManager,
		private readonly tenantManager: ITenantManager,
		private readonly restTenantThrottlers: Map<string, IThrottler>,
		private readonly restClusterThrottlers: Map<string, IThrottler>,
		private readonly socketConnectTenantThrottler: IThrottler,
		private readonly socketConnectClusterThrottler: IThrottler,
		private readonly socketSubmitOpThrottler: IThrottler,
		private readonly socketSubmitSignalThrottler: IThrottler,
		private readonly singleUseTokenCache: ICache,
		private readonly storage: IDocumentStorage,
		private readonly clientManager: IClientManager,
		private readonly appTenants: IAlfredTenant[],
		private readonly deltaService: IDeltaService,
		private readonly producer: IProducer,
		private readonly metricClientConfig: any,
		private readonly documentRepository: IDocumentRepository,
		private readonly documentDeleteService: IDocumentDeleteService,
		private readonly throttleAndUsageStorageManager?: IThrottleAndUsageStorageManager,
		private readonly verifyMaxMessageSize?: boolean,
		private readonly cache?: ICache,
		private readonly socketTracker?: IWebSocketTracker,
		private readonly tokenRevocationManager?: ITokenRevocationManager,
		private readonly revokedTokenChecker?: IRevokedTokenChecker,
	) {}

	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public start(): Promise<void> {
		this.runningDeferred = new Deferred<void>();

		// Create the HTTP server and attach alfred to it
		const alfred = app.create(
			this.config,
			this.tenantManager,
			this.restTenantThrottlers,
			this.restClusterThrottlers,
			this.singleUseTokenCache,
			this.storage,
			this.appTenants,
			this.deltaService,
			this.producer,
			this.documentRepository,
			this.documentDeleteService,
			this.tokenRevocationManager,
			this.revokedTokenChecker,
		);
		alfred.set("port", this.port);

		this.server = this.serverFactory.create(alfred);

		const httpServer = this.server.httpServer;

		const maxNumberOfClientsPerDocument = this.config.get(
			"alfred:maxNumberOfClientsPerDocument",
		);
		const numberOfMessagesPerTrace = this.config.get("alfred:numberOfMessagesPerTrace");
		const maxTokenLifetimeSec = this.config.get("auth:maxTokenLifetimeSec");
		const isTokenExpiryEnabled = this.config.get("auth:enableTokenExpiration");
		const isClientConnectivityCountingEnabled = this.config.get(
			"usage:clientConnectivityCountingEnabled",
		);
		const isSignalUsageCountingEnabled = this.config.get("usage:signalUsageCountingEnabled");

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
			this.cache,
			this.socketConnectTenantThrottler,
			this.socketConnectClusterThrottler,
			this.socketSubmitOpThrottler,
			this.socketSubmitSignalThrottler,
			this.throttleAndUsageStorageManager,
			this.verifyMaxMessageSize,
			this.socketTracker,
			this.revokedTokenChecker,
		);

		// Listen on provided port, on all network interfaces.
		httpServer.listen(this.port);
		httpServer.on("error", (error) => this.onError(error));
		httpServer.on("listening", () => this.onListening());

		// Start token manager
		if (this.tokenRevocationManager) {
			this.tokenRevocationManager.start().catch((error) => {
				// Prevent service crash if token revocation manager fails to start
				Lumberjack.error("Failed to start token revocation manager.", undefined, error);
			});
		}

		this.stopped = false;

		return this.runningDeferred.promise;
	}

	public async stop(caller?: string, uncaughtException?: any): Promise<void> {
		if (this.stopped) {
			Lumberjack.info("AlfredRunner.stop already called, returning early.");
			return;
		}

		this.stopped = true;
		Lumberjack.info("AlfredRunner.stop starting.");

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
	 * Event listener for HTTP server "listening" event.
	 */
	private onListening() {
		const addr = this.server.httpServer.address();
		const bind = typeof addr === "string" ? `pipe ${addr}` : `port ${addr.port}`;
		winston.info(`Listening on ${bind}`);
		Lumberjack.info(`Listening on ${bind}`);
	}
}
