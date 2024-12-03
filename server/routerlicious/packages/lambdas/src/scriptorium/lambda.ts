/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	extractBoxcar,
	ICollection,
	IContext,
	IQueuedMessage,
	IPartitionLambda,
	ISequencedOperationMessage,
	SequencedOperationType,
	runWithRetry,
	isRetryEnabled,
} from "@fluidframework/server-services-core";
import {
	getLumberBaseProperties,
	Lumberjack,
	LumberEventName,
	Lumber,
	QueuedMessageProperties,
	CommonProperties,
} from "@fluidframework/server-services-telemetry";
import { convertSortedNumberArrayToRanges } from "@fluidframework/server-services-client";
import { circuitBreakerOptions, LambdaCircuitBreaker } from "../utils";

enum ScriptoriumStatus {
	Processing = "Processing",
	ProcessingComplete = "ProcessingComplete",
	CheckpointComplete = "CheckpointComplete",
	ProcessingFailed = "ProcessingFailed",
	CheckpointFailed = "CheckpointFailed",
}

/**
 * @internal
 */
export class ScriptoriumLambda implements IPartitionLambda {
	private pending = new Map<string, ISequencedOperationMessage[]>();
	private pendingOffset: IQueuedMessage | undefined;
	private current = new Map<string, ISequencedOperationMessage[]>();
	private readonly clientFacadeRetryEnabled: boolean;
	private readonly telemetryEnabled: boolean;
	private readonly shouldLogInitialSuccessVerbose: boolean;
	private pendingMetric: Lumber<LumberEventName.ScriptoriumProcessBatch> | undefined;
	private readonly maxDbBatchSize: number;
	private readonly restartOnCheckpointFailure: boolean;
	private readonly logSavedOpsTimeIntervalMs: number;
	private readonly opsCountTelemetryEnabled: boolean;
	private savedOpsCount: number = 0;
	private lastSuccessfulOffset: number | undefined;
	private readonly dbCircuitBreaker: LambdaCircuitBreaker | undefined;
	private readonly circuitBreakerEnabled: boolean;
	private readonly circuitBreakerOptions: Record<string, any>;

	constructor(
		private readonly opCollection: ICollection<any>,
		protected context: IContext,
		private readonly providerConfig: Record<string, any> | undefined,
		private readonly dbHealthCheckFunction: (...args: any[]) => Promise<any>,
	) {
		this.clientFacadeRetryEnabled = isRetryEnabled(this.opCollection);
		this.telemetryEnabled = this.providerConfig?.enableTelemetry;
		this.shouldLogInitialSuccessVerbose =
			this.providerConfig?.shouldLogInitialSuccessVerbose ?? false;
		this.maxDbBatchSize = this.providerConfig?.maxDbBatchSize ?? 1000;
		this.restartOnCheckpointFailure = this.providerConfig?.restartOnCheckpointFailure;
		this.logSavedOpsTimeIntervalMs = this.providerConfig?.logSavedOpsTimeIntervalMs ?? 60000;
		this.opsCountTelemetryEnabled = this.providerConfig?.opsCountTelemetryEnabled;
		this.circuitBreakerEnabled = this.providerConfig?.circuitBreakerEnabled;
		this.circuitBreakerOptions = this.providerConfig?.circuitBreakerOptions;

		// setup circuit breaker
		if (this.circuitBreakerEnabled) {
			try {
				const dbCircuitBreakerOptions: circuitBreakerOptions = {
					errorThresholdPercentage:
						this.circuitBreakerOptions.errorThresholdPercentage ?? 0.001, // Percentage of errors before opening the circuit
					resetTimeout: this.circuitBreakerOptions.resetTimeout ?? 30000, // Time in milliseconds before attempting to close the circuit after it has been opened
					timeout: this.circuitBreakerOptions.timeout ?? false, // Time in milliseconds before a request is considered timed out
					rollingCountTimeout: this.circuitBreakerOptions.rollingCountTimeout ?? 1000, // Time in milliseconds before the rolling window resets
					rollingCountBuckets: this.circuitBreakerOptions.rollingCountBuckets ?? 1000, // Number of buckets in the rolling window
					errorFilter: this.errorFilterForCircuitBreaker.bind(this), // Function to filter errors - if it returns true for certain errors, they will not open the circuit
					fallbackToRestartTimeoutMs:
						this.circuitBreakerOptions.fallbackToRestartTimeoutMs ?? 180000,
				};

				this.dbCircuitBreaker = new LambdaCircuitBreaker(
					dbCircuitBreakerOptions,
					this.context,
					"MongoDB",
					runWithRetry,
					this.dbHealthCheckFunction,
				);
			} catch (error) {
				Lumberjack.error("Error while creating circuit breaker in scriptorium", {}, error);
				throw error; // will be caught in partition.ts during factory.create and it will restart the service
			}
		}
	}

	/**
	 * {@inheritDoc IPartitionLambda.handler}
	 */
	public handler(message: IQueuedMessage): undefined {
		if (this.opsCountTelemetryEnabled) {
			setInterval(() => {
				if (this.savedOpsCount > 0) {
					Lumberjack.info("Scriptorium: Ops saved to db.", {
						savedOpsCount: this.savedOpsCount,
					});
					this.savedOpsCount = 0;
				}
			}, this.logSavedOpsTimeIntervalMs);
		}

		const boxcar = extractBoxcar(message);

		for (const baseMessage of boxcar.contents) {
			if (baseMessage.type === SequencedOperationType) {
				const value = baseMessage as ISequencedOperationMessage;

				// Remove traces and serialize content before writing to mongo.
				value.operation.traces = [];

				const topic = `${value.tenantId}/${value.documentId}`;

				let pendingMessages = this.pending.get(topic);
				if (!pendingMessages) {
					pendingMessages = [];
					this.pending.set(topic, pendingMessages);
				}

				pendingMessages.push(value);
			}
		}

		this.pendingOffset = message;

		// initialize last successful offset
		if (this.lastSuccessfulOffset === undefined) {
			this.lastSuccessfulOffset = message.offset - 1;
		}

		if (this.telemetryEnabled && this.pending.size > 0) {
			if (this.pendingMetric === undefined) {
				// create a new metric for processing the current kafka batch
				this.pendingMetric = Lumberjack.newLumberMetric(
					LumberEventName.ScriptoriumProcessBatch,
					{
						timestampQueuedMessage: message.timestamp
							? new Date(message.timestamp).toISOString()
							: null,
						timestampReadyToProcess: new Date().toISOString(),
						[QueuedMessageProperties.partition]: this.pendingOffset?.partition,
						[QueuedMessageProperties.offsetStart]: this.pendingOffset?.offset,
						[QueuedMessageProperties.offsetEnd]: this.pendingOffset?.offset,
						[CommonProperties.totalBatchSize]: boxcar.contents.length,
					},
				);
			} else {
				// previous batch is still waiting to be processed, update properties in the existing metric
				this.pendingMetric.setProperty(
					QueuedMessageProperties.offsetEnd,
					this.pendingOffset?.offset,
				);
				const currentBatchSize = boxcar.contents.length;
				const previousBatchSize = Number(
					this.pendingMetric.properties.get(CommonProperties.totalBatchSize),
				);
				this.pendingMetric.setProperty(
					CommonProperties.totalBatchSize,
					previousBatchSize + currentBatchSize,
				);
			}
		}

		this.sendPending();

		return undefined;
	}

	public close(): void {
		this.pending.clear();
		this.current.clear();
		this.dbCircuitBreaker?.shutdown();
	}

	public pause(offset: number): void {
		this.current.clear();
		this.pending.clear();
		this.pendingMetric = undefined;
		Lumberjack.info("ScriptoriumLambda paused");
	}

	private errorFilterForCircuitBreaker(error: any): boolean {
		for (const errorFilter of this.circuitBreakerOptions.filterOnErrors ?? []) {
			if (
				error?.message?.toString()?.indexOf(errorFilter) >= 0 ||
				error?.stack?.toString()?.indexOf(errorFilter) >= 0
			) {
				return false; // circuit breaker will open and pause the lambda
			}
		}
		return true; // do not open the circuit for other errors, and let scriptorium restart
	}

	private sendPending(): void {
		// If there is work currently being sent or we have no pending work return early
		if (this.current.size > 0 || this.pending.size === 0) {
			return;
		}

		let metric: Lumber<LumberEventName.ScriptoriumProcessBatch> | undefined;
		if (this.telemetryEnabled && this.pendingMetric) {
			metric = this.pendingMetric;
			this.pendingMetric = undefined;

			metric.setProperty("timestampProcessingStart", new Date().toISOString());
		}

		let status = ScriptoriumStatus.Processing;

		// Swap current and pending
		const temp = this.current;
		this.current = this.pending;
		this.pending = temp;
		const batchOffset = this.pendingOffset;

		const allProcessed: Promise<void>[] = [];

		// Process all the batches + checkpoint
		for (const [, messages] of this.current) {
			if (this.maxDbBatchSize > 0 && messages.length > this.maxDbBatchSize) {
				// cap the max batch size sent to mongo db
				let startIndex = 0;
				while (startIndex < messages.length) {
					const endIndex = startIndex + this.maxDbBatchSize;
					const messagesBatch = messages.slice(startIndex, endIndex);
					startIndex = endIndex;

					const processP = this.processMongoCore(messagesBatch, metric?.id).then(() => {
						this.savedOpsCount += messagesBatch.length;
					});
					allProcessed.push(processP);
				}
			} else {
				const processP = this.processMongoCore(messages, metric?.id).then(() => {
					this.savedOpsCount += messages.length;
				});
				allProcessed.push(processP);
			}
		}

		Promise.all(allProcessed)
			.then(() => {
				this.current.clear();
				status = ScriptoriumStatus.ProcessingComplete;
				metric?.setProperty("timestampProcessingComplete", new Date().toISOString());

				// checkpoint batch offset
				try {
					this.lastSuccessfulOffset = batchOffset?.offset;
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					this.context.checkpoint(batchOffset!, this.restartOnCheckpointFailure);
					status = ScriptoriumStatus.CheckpointComplete;
					metric?.setProperty("timestampCheckpointComplete", new Date().toISOString());
				} catch (error) {
					status = ScriptoriumStatus.CheckpointFailed;
					metric?.setProperty("timestampCheckpointFailed", new Date().toISOString());
					const errorMessage = "Scriptorium failed to checkpoint batch";
					this.logErrorTelemetry(
						errorMessage,
						error,
						status,
						batchOffset?.offset,
						metric,
					);
					throw error;
				}

				metric?.setProperty("status", status);
				metric?.success("Scriptorium completed processing and checkpointing of batch");

				// continue with next batch
				this.sendPending();
			})
			.catch((error) => {
				// catches error if any of the promises failed in Promise.all, i.e. any of the ops failed to write to db
				status = ScriptoriumStatus.ProcessingFailed;
				metric?.setProperty("timestampProcessingFailed", new Date().toISOString());

				if (error.circuitBreakerOpen === true && this.lastSuccessfulOffset !== undefined) {
					const errorMessage =
						"Scriptorium failed to process batch, circuit breaker is opened and pausing lambda";
					this.logErrorTelemetry(
						errorMessage,
						error,
						status,
						batchOffset?.offset,
						metric,
					);

					// Circuit breaker is open, pause lambda. It will be resumed when circuit breaker closes after some time.
					this.context.pause(this.lastSuccessfulOffset + 1, error);
					return;
				} else {
					const errorMessage = "Scriptorium failed to process batch, going to restart";
					this.logErrorTelemetry(
						errorMessage,
						error,
						status,
						batchOffset?.offset,
						metric,
					);

					// Restart scriptorium
					this.context.error(error, { restart: true });
				}
			});
	}

	private logErrorTelemetry(
		errorMessage: string,
		error: any,
		status: string,
		batchOffset: number | undefined,
		metric: Lumber<LumberEventName.ScriptoriumProcessBatch> | undefined,
	): void {
		if (this.telemetryEnabled && metric) {
			metric.setProperty("status", status);
			metric.error(errorMessage, error);
		} else {
			Lumberjack.error(errorMessage, { batchOffset, status }, error);
		}
	}

	private async processMongoCore(
		messages: ISequencedOperationMessage[],
		scriptoriumMetricId: string | undefined,
	): Promise<void> {
		return this.insertOp(messages, scriptoriumMetricId);
	}

	private async insertOp(
		messages: ISequencedOperationMessage[],
		scriptoriumMetricId: string | undefined,
	): Promise<void | undefined> {
		const dbOps = messages.map((message) => ({
			...message,
			mongoTimestamp: new Date(message.operation.timestamp),
		}));

		const documentId = messages[0]?.documentId ?? "";
		const tenantId = messages[0]?.tenantId ?? "";

		const sequenceNumbers = messages.map((message) => message.operation.sequenceNumber);
		const sequenceNumberRanges = convertSortedNumberArrayToRanges(sequenceNumbers);
		const insertBatchSize = dbOps.length;
		const runWithRetryArgs: [
			() => Promise<any>,
			string,
			number,
			number,
			Map<string, any> | Record<string, any> | undefined,
			((error: any) => boolean) | undefined,
			((error: any) => boolean) | undefined,
			((error: any, numRetries: number, retryAfterInterval: number) => number) | undefined,
			((error: any) => void) | undefined,
			boolean,
			boolean,
		] = [
			async (): Promise<any> => this.opCollection.insertMany(dbOps, false),
			"insertOpScriptorium",
			3 /* maxRetries */,
			1000 /* retryAfterMs */,
			{
				...getLumberBaseProperties(documentId, tenantId),
				sequenceNumberRanges,
				insertBatchSize,
				scriptoriumMetricId,
			},
			(error): boolean =>
				error.code === 11000 ||
				error.message?.toString()?.indexOf("E11000 duplicate key") >= 0,
			(error): boolean => !this.clientFacadeRetryEnabled /* shouldRetry */,
			undefined /* calculateIntervalMs */,
			undefined /* onErrorFn */,
			this.telemetryEnabled,
			this.shouldLogInitialSuccessVerbose,
		];
		return this.dbCircuitBreaker
			? this.dbCircuitBreaker.execute(runWithRetryArgs)
			: runWithRetry(...runWithRetryArgs);
	}
}
