/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import cluster from "cluster";
import {
	Deferred,
	IRunner,
	ISecretManager,
	IWebServerFactory,
	IWebServer,
	ICache,
	IReadinessCheck,
} from "@fluidframework/server-services-core";
import { LumberEventName, Lumberjack } from "@fluidframework/server-services-telemetry";
import { runnerHttpServerStop } from "@fluidframework/server-services-shared";
import { Provider } from "nconf";
import type { ITenantKeyGenerator } from "@fluidframework/server-services-utils";
import * as app from "./app";
import { ITenantRepository } from "./mongoTenantRepository";

/**
 * @internal
 */
export class RiddlerRunner implements IRunner {
	private server?: IWebServer;
	private runningDeferred?: Deferred<void>;
	private stopped: boolean = false;
	private readonly runnerMetric = Lumberjack.newLumberMetric(LumberEventName.RiddlerRunner);

	constructor(
		private readonly serverFactory: IWebServerFactory,
		private readonly tenantRepository: ITenantRepository,
		private readonly port: string | number,
		private readonly loggerFormat: string,
		private readonly baseOrdererUrl: string,
		private readonly defaultHistorianUrl: string,
		private readonly defaultInternalHistorianUrl: string,
		private readonly secretManager: ISecretManager,
		private readonly fetchTenantKeyMetricInterval: number,
		private readonly riddlerStorageRequestMetricInterval: number,
		private readonly tenantKeyGenerator: ITenantKeyGenerator,
		private readonly startupCheck: IReadinessCheck,
		private readonly cache?: ICache,
		private readonly config?: Provider,
		private readonly readinessCheck?: IReadinessCheck,
	) {}

	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public start(): Promise<void> {
		this.runningDeferred = new Deferred<void>();

		const usingClusterModule: boolean | undefined = this.config?.get("riddler:useNodeCluster");
		// Don't include application logic in primary thread when Node.js cluster module is enabled.
		const includeAppLogic = !(cluster.isPrimary && usingClusterModule);

		if (includeAppLogic) {
			// Create the HTTP server and attach alfred to it
			const riddler = app.create(
				this.tenantRepository,
				this.loggerFormat,
				this.baseOrdererUrl,
				this.defaultHistorianUrl,
				this.defaultInternalHistorianUrl,
				this.secretManager,
				this.fetchTenantKeyMetricInterval,
				this.riddlerStorageRequestMetricInterval,
				this.tenantKeyGenerator,
				this.startupCheck,
				this.cache,
				this.readinessCheck,
			);
			riddler.set("port", this.port);

			this.server = this.serverFactory.create(riddler);
		} else {
			this.server = this.serverFactory.create(undefined);
		}

		const httpServer = this.server.httpServer;
		httpServer.on("error", (error) => this.onError(error));
		httpServer.on("listening", () => this.onListening());
		// Listen on primary thread port, or allow cluster module to assign random port for worker thread.
		httpServer.listen(this.port);

		this.stopped = false;

		if (this.startupCheck.setReady) {
			this.startupCheck.setReady();
		}
		return this.runningDeferred.promise;
	}

	public async stop(caller?: string, uncaughtException?: any): Promise<void> {
		if (this.stopped) {
			Lumberjack.info("RiddlerRunner.stop already called, returning early.", { caller });
			return;
		}

		this.stopped = true;
		Lumberjack.info("RiddlerRunner.stop starting.", { caller });

		const runnerServerCloseTimeoutMs =
			this.config?.get("shared:runnerServerCloseTimeoutMs") ?? 30000;

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
		Lumberjack.info(`Listening on ${bind}`);
	}
}
