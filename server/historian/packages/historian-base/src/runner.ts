/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@fluidframework/common-utils";
import {
	IThrottler,
	IWebServer,
	IWebServerFactory,
	IRunner,
	IRevokedTokenChecker,
	IStorageNameRetriever,
	IDocumentManager,
	IReadinessCheck,
} from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import * as winston from "winston";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { ICache, IDenyList, ITenantService, ISimplifiedCustomDataRetriever } from "./services";
import * as app from "./app";

export class HistorianRunner implements IRunner {
	private server: IWebServer | undefined;
	private runningDeferred: Deferred<void> | undefined;

	constructor(
		private readonly serverFactory: IWebServerFactory,
		private readonly config: Provider,
		private readonly port: string | number,
		private readonly riddler: ITenantService,
		private readonly storageNameRetriever: IStorageNameRetriever | undefined,
		public readonly restTenantThrottlers: Map<string, IThrottler>,
		public readonly restClusterThrottlers: Map<string, IThrottler>,
		private readonly documentManager: IDocumentManager,
		private readonly startupCheck: IReadinessCheck,
		private readonly cache?: ICache,
		private readonly revokedTokenChecker?: IRevokedTokenChecker,
		private readonly denyList?: IDenyList,
		private readonly ephemeralDocumentTTLSec?: number,
		private readonly readinessCheck?: IReadinessCheck,
		private readonly simplifiedCustomDataRetriever?: ISimplifiedCustomDataRetriever,
	) {}

	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public start(): Promise<void> {
		this.runningDeferred = new Deferred<void>();
		// Create the historian app
		const historian = app.create(
			this.config,
			this.riddler,
			this.storageNameRetriever,
			this.restTenantThrottlers,
			this.restClusterThrottlers,
			this.documentManager,
			this.startupCheck,
			this.cache,
			this.revokedTokenChecker,
			this.denyList,
			this.ephemeralDocumentTTLSec,
			this.readinessCheck,
			this.simplifiedCustomDataRetriever,
		);
		historian.set("port", this.port);

		this.server = this.serverFactory.create(historian);
		const httpServer = this.server.httpServer;

		// Listen on provided port, on all network interfaces.
		httpServer.listen(this.port);
		httpServer.on("error", (error) => this.onError(error));
		httpServer.on("listening", () => this.onListening());

		if (this.startupCheck.setReady) {
			this.startupCheck.setReady();
		}
		return this.runningDeferred.promise;
	}

	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public stop(): Promise<void> {
		// Close the underlying server and then resolve the runner once closed
		this.server
			?.close()
			.then(() => {
				this.runningDeferred?.resolve();
			})
			.catch((error) => {
				this.runningDeferred?.reject(error);
			});

		return this.runningDeferred?.promise ?? Promise.resolve();
	}

	/**
	 * Event listener for HTTP server "error" event.
	 */

	private onError(error) {
		if (error.syscall !== "listen") {
			throw error;
		}

		const bind = typeof this.port === "string" ? `Pipe ${this.port}` : `Port ${this.port}`;

		// handle specific listen errors with friendly messages
		switch (error.code) {
			case "EACCES":
				winston.error(`${bind} requires elevated privileges`);
				Lumberjack.error(`${bind} requires elevated privileges`);
				process.exit(1);
				break;
			case "EADDRINUSE":
				winston.error(`${bind} is already in use`);
				Lumberjack.error(`${bind} is already in use`);
				process.exit(1);
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
