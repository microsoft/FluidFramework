/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { inspect } from "util";
import { serializeError } from "serialize-error";
import { Deferred } from "@fluidframework/server-common-utils";
import { promiseTimeout } from "@fluidframework/server-services-client";
import {
	IConsumer,
	IContextErrorData,
	ILogger,
	IPartitionLambdaFactory,
	IRunner,
} from "@fluidframework/server-services-core";
import {
	getLumberBaseProperties,
	LumberEventName,
	Lumberjack,
} from "@fluidframework/server-services-telemetry";
import { Provider } from "nconf";
import { PartitionManager } from "./partitionManager";

/**
 * @internal
 */
export class KafkaRunner implements IRunner {
	private deferred: Deferred<void> | undefined;
	private partitionManager: PartitionManager | undefined;
	private stopped: boolean = false;
	private readonly runnerMetric = Lumberjack.newLumberMetric(LumberEventName.KafkaRunner);
	private runnerMetricProperties: Map<string, any> | Record<string, any> | undefined;

	constructor(
		private readonly factory: IPartitionLambdaFactory,
		private readonly consumer: IConsumer,
		private readonly config?: Provider,
	) {}

	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public start(logger: ILogger | undefined): Promise<void> {
		if (this.deferred) {
			this.runnerMetric.error("Runner already started");
			throw new Error("Already started");
		}

		this.deferred = new Deferred<void>();

		process.on("warning", (msg) => {
			console.trace("Warning", msg);
		});

		this.factory.on("error", (error) => {
			this.runnerMetric.error("Kafka factory encountered an error", error);
			this.deferred?.reject(error);
			this.deferred = undefined;
		});

		this.partitionManager = new PartitionManager(
			this.factory,
			this.consumer,
			logger,
			this.config,
		);
		this.partitionManager.on("error", (error, errorData: IContextErrorData) => {
			const documentId = errorData?.documentId ?? "";
			const tenantId = errorData?.tenantId ?? "";
			const lumberProperties = getLumberBaseProperties(documentId, tenantId);
			const metadata = {
				messageMetaData: {
					documentId,
					tenantId,
				},
			};

			this.runnerMetricProperties = {
				...lumberProperties,
				errorLabel: errorData?.errorLabel,
			};

			this.runnerMetric.setProperties(this.runnerMetricProperties);
			if (typeof error === "object" && error !== null) {
				error.errorLabel = errorData?.errorLabel;
			}

			if (errorData && !errorData.restart) {
				const errorMsg =
					"KafkaRunner encountered an error that is not configured to trigger restart";
				logger?.error(errorMsg, metadata);
				logger?.error(inspect(error), metadata);
				if (!this.runnerMetric.isCompleted()) {
					this.runnerMetric.error(errorMsg, error);
				} else {
					Lumberjack.error(errorMsg, this.runnerMetricProperties, error);
				}
			} else {
				const errorMsg = "KafkaRunner encountered an error that will trigger a restart";
				logger?.error(errorMsg, metadata);
				logger?.error(inspect(error), metadata);
				if (!this.runnerMetric.isCompleted()) {
					this.runnerMetric.error(errorMsg, error);
				} else {
					Lumberjack.error(errorMsg, this.runnerMetricProperties, error);
				}
				this.deferred?.reject(error);
				this.deferred = undefined;
			}
		});

		this.partitionManager.on("pause", (partitionId: number, offset: number, reason?: any) => {
			this.pause(partitionId, offset)
				.then(() => {
					Lumberjack.info("KafkaRunner paused", {
						partitionId,
						offset,
						reason: serializeError(reason),
					});
				})
				.catch((error) => {
					Lumberjack.error(
						"KafkaRunner encountered an error during pause",
						{ partitionId, offset, reason },
						error,
					);
				});
		});

		this.partitionManager.on("resume", (partitionId: number) => {
			this.resume(partitionId)
				.then(() => {
					Lumberjack.info("KafkaRunner resumed", { partitionId });
				})
				.catch((error) => {
					Lumberjack.error(
						"KafkaRunner encountered an error during resume",
						{ partitionId },
						error,
					);
				});
		});

		this.stopped = false;

		return this.deferred.promise;
	}

	public async pause(partitionId: number, offset: number): Promise<void> {
		Lumberjack.info(`KafkaRunner.pause starting`, { partitionId, offset });
		if (this.consumer.pauseFetching) {
			const seekTimeout = this.config?.get("kafka:seekTimeoutAfterPause") ?? 1000;
			await this.consumer.pauseFetching(partitionId, seekTimeout, offset);
		}
		this.partitionManager?.pause(partitionId, offset);
	}

	public async resume(partitionId: number): Promise<void> {
		Lumberjack.info(`KafkaRunner.resume starting`, { partitionId });
		if (this.consumer.resumeFetching) {
			await this.consumer.resumeFetching(partitionId);
		}
		this.partitionManager?.resume(partitionId);
	}

	/**
	 * Signals to stop the service
	 */
	public async stop(caller?: string, uncaughtException?: any): Promise<void> {
		if (this.stopped) {
			Lumberjack.info("KafkaRunner.stop already called, returning early.", { caller });
			return;
		}

		this.stopped = true;
		Lumberjack.info("KafkaRunner.stop starting.", { caller });
		try {
			this.runnerMetric.setProperty("caller", caller);

			// Stop listening for new updates
			await this.consumer.pause();

			// Stop the partition manager
			await this.partitionManager?.stop();

			// Dispose the factory
			await this.factory.dispose();

			// Close the underlying consumer, but setting a timeout for safety
			await promiseTimeout(30000, this.consumer.close());

			// Mark ourselves done once the partition manager has stopped
			if (caller === "uncaughtException") {
				this.deferred?.reject({
					uncaughtException: serializeError(uncaughtException),
				}); // reject the promise so that the runService exits the process with exit(1)
			} else {
				this.deferred?.resolve();
			}
			this.deferred = undefined;
			if (!this.runnerMetric.isCompleted()) {
				this.runnerMetric.success("KafkaRunner stopped");
			} else {
				Lumberjack.info("KafkaRunner stopped", { ...this.runnerMetricProperties, caller });
			}
		} catch (error) {
			if (!this.runnerMetric.isCompleted()) {
				this.runnerMetric.error("KafkaRunner encountered an error during stop", error);
			} else {
				Lumberjack.error(
					"KafkaRunner encountered an error during stop",
					{ ...this.runnerMetricProperties, caller },
					error,
				);
			}
			if (caller === "sigterm") {
				this.deferred?.resolve();
			} else {
				// uncaughtException
				this.deferred?.reject({
					forceKill: true,
					uncaughtException: serializeError(uncaughtException),
					runnerStopException: serializeError(error),
				});
			}
			this.deferred = undefined;
			throw error;
		}
	}
}
