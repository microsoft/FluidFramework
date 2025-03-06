/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import cluster from "cluster";
import {
	Deferred,
	ICache,
	IClusterDrainingChecker,
	IDeltaService,
	IDocumentStorage,
	IProducer,
	IRunner,
	ITenantManager,
	IThrottler,
	IWebServer,
	IWebServerFactory,
	IDocumentRepository,
	ITokenRevocationManager,
	IRevokedTokenChecker,
	IFluidAccessTokenGenerator,
	IReadinessCheck,
	TypedEventEmitter
} from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import * as winston from "winston";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { LumberEventName, Lumberjack } from "@fluidframework/server-services-telemetry";
import { ICollaborationSessionEvents } from "@fluidframework/server-lambdas";
import { runnerHttpServerStop } from "@fluidframework/server-services-shared";
import * as app from "./app";
import { IDocumentDeleteService } from "./services";

/**
 * @internal
 */
export class AlfredRunner implements IRunner {
	private server?: IWebServer;
	private runningDeferred?: Deferred<void>;
	private stopped: boolean = false;
	private readonly runnerMetric = Lumberjack.newLumberMetric(LumberEventName.AlfredRunner);

	constructor(
		private readonly serverFactory: IWebServerFactory,
		private readonly config: Provider,
		private readonly port: string | number,
		private readonly tenantManager: ITenantManager,
		private readonly restTenantThrottlers: Map<string, IThrottler>,
		private readonly restClusterThrottlers: Map<string, IThrottler>,
		private readonly singleUseTokenCache: ICache,
		private readonly storage: IDocumentStorage,
		private readonly appTenants: IAlfredTenant[],
		private readonly deltaService: IDeltaService,
		private readonly producer: IProducer,
		private readonly documentRepository: IDocumentRepository,
		private readonly documentDeleteService: IDocumentDeleteService,
		private readonly startupCheck: IReadinessCheck,
		private readonly tokenRevocationManager?: ITokenRevocationManager,
		private readonly revokedTokenChecker?: IRevokedTokenChecker,
		private readonly collaborationSessionEventEmitter?: TypedEventEmitter<ICollaborationSessionEvents>,
		private readonly clusterDrainingChecker?: IClusterDrainingChecker,
		private readonly enableClientIPLogging?: boolean,
		private readonly readinessCheck?: IReadinessCheck,
		private readonly fluidAccessTokenGenerator?: IFluidAccessTokenGenerator,
	) {}

	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public start(): Promise<void> {
		this.runningDeferred = new Deferred<void>();

		const usingClusterModule: boolean | undefined = this.config.get("alfred:useNodeCluster");
		// Don't include application logic in primary thread when Node.js cluster module is enabled.
		const includeAppLogic = !(cluster.isPrimary && usingClusterModule);

		if (includeAppLogic) {
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
				this.startupCheck,
				this.tokenRevocationManager,
				this.revokedTokenChecker,
				this.collaborationSessionEventEmitter,
				this.clusterDrainingChecker,
				this.enableClientIPLogging,
				this.readinessCheck,
				this.fluidAccessTokenGenerator,
			);
			alfred.set("port", this.port);
			this.server = this.serverFactory.create(alfred);

			if (this.tokenRevocationManager) {
				this.tokenRevocationManager.start().catch((error) => {
					// Prevent service crash if token revocation manager fails to start
					Lumberjack.error("Failed to start token revocation manager.", undefined, error);
				});
			}
		} else {
			// Create an HTTP server with a blank request listener
			this.server = this.serverFactory.create(undefined);
		}

		const httpServer = this.server.httpServer;
		httpServer.on("error", (error) => this.onError(error));
		httpServer.on("listening", () => this.onListening());

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
			Lumberjack.info("AlfredRunner.stop already called, returning early.", { caller });
			return;
		}

		this.stopped = true;
		Lumberjack.info("AlfredRunner.stop starting.", { caller });

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
		const addr = this.server?.httpServer?.address();
		const bind = typeof addr === "string" ? `pipe ${addr}` : `port ${addr?.port}`;
		winston.info(`Listening on ${bind}`);
		Lumberjack.info(`Listening on ${bind}`);
	}
}
