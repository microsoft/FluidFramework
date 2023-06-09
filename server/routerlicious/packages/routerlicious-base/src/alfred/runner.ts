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
} from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import * as winston from "winston";
import { createMetricClient } from "@fluidframework/server-services";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { configureWebSocketServices } from "@fluidframework/server-lambdas";
import * as app from "./app";
import { IDocumentDeleteService } from "./services";

export class AlfredRunner implements IRunner {
	private server: IWebServer;
	private runningDeferred: Deferred<void>;

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
		private readonly redisCache?: ICache,
		private readonly socketTracker?: IWebSocketTracker,
		private readonly tokenManager?: ITokenRevocationManager,
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
			this.tokenManager,
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
			this.redisCache,
			this.socketConnectTenantThrottler,
			this.socketConnectClusterThrottler,
			this.socketSubmitOpThrottler,
			this.socketSubmitSignalThrottler,
			this.throttleAndUsageStorageManager,
			this.verifyMaxMessageSize,
			this.socketTracker,
		);

		// Listen on provided port, on all network interfaces.
		httpServer.listen(this.port);
		httpServer.on("error", (error) => this.onError(error));
		httpServer.on("listening", () => this.onListening());

		// Start token manager
		if (this.tokenManager) {
			this.tokenManager.start().catch((error) => {
				this.runningDeferred.reject(error);
			});
		}

		return this.runningDeferred.promise;
	}

	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public stop(): Promise<void> {
		// Close the underlying server and then resolve the runner once closed
		this.server.close().then(
			() => {
				this.runningDeferred.resolve();
			},
			(error) => {
				this.runningDeferred.reject(error);
			},
		);

		return this.runningDeferred.promise;
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
				this.runningDeferred.reject(`${bind} requires elevated privileges`);
				break;
			case "EADDRINUSE":
				this.runningDeferred.reject(`${bind} is already in use`);
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
