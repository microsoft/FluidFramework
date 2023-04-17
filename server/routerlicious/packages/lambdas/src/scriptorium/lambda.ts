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

enum ScriptoriumStatus {
	Processing = "Processing",
	ProcessingComplete = "ProcessingComplete",
	CheckpointComplete = "CheckpointComplete",
	ProcessingFailed = "ProcessingFailed",
	CheckpointFailed = "CheckpointFailed",
}

export class ScriptoriumLambda implements IPartitionLambda {
	private pending = new Map<string, ISequencedOperationMessage[]>();
	private pendingOffset: IQueuedMessage | undefined;
	private current = new Map<string, ISequencedOperationMessage[]>();
	private readonly clientFacadeRetryEnabled: boolean;
	private readonly telemetryEnabled: boolean;
	private pendingMetric: Lumber<LumberEventName.ScriptoriumProcessBatch> | undefined;
	private readonly maxDbBatchSize: number;

	constructor(
		private readonly opCollection: ICollection<any>,
		protected context: IContext,
		private readonly providerConfig: Record<string, any> | undefined,
	) {
		this.clientFacadeRetryEnabled = isRetryEnabled(this.opCollection);
		this.telemetryEnabled = this.providerConfig?.enableTelemetry;
		this.maxDbBatchSize = this.providerConfig?.maxDbBatchSize ?? 1000;
	}

	public handler(message: IQueuedMessage) {
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

		if (this.telemetryEnabled) {
			if (this.pendingMetric === undefined) {
				// create a new metric for processing the current kafka batch
				this.pendingMetric = Lumberjack.newLumberMetric(
					LumberEventName.ScriptoriumProcessBatch,
					{
						timestampQueuedMessage: message.timestamp ? new Date(message.timestamp).toISOString() : null,
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

	public close() {
		this.pending.clear();
		this.current.clear();

		return;
	}

	private sendPending() {
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
			if (this.maxDbBatchSize > 0 && messages.length > this.maxDbBatchSize) { // cap the max batch size sent to mongo db
				let startIndex = 0;
				while(startIndex < messages.length) {
					const endIndex = startIndex + this.maxDbBatchSize;
					const messagesBatch = messages.slice(startIndex, endIndex);
					startIndex = endIndex;

					const processP = this.processMongoCore(messagesBatch, metric?.id);
					allProcessed.push(processP);
				}
			} else {
				const processP = this.processMongoCore(messages, metric?.id);
				allProcessed.push(processP);
			}
		}

		Promise.all(allProcessed).then(
			() => {
				this.current.clear();
				status = ScriptoriumStatus.ProcessingComplete;
				metric?.setProperty("timestampProcessingComplete", new Date().toISOString());

				// checkpoint batch offset
				try {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					this.context.checkpoint(batchOffset!);
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
			},
			(error) => {
				// catches error if any of the promises failed in Promise.all, i.e. any of the ops failed to write to db
				status = ScriptoriumStatus.ProcessingFailed;
				metric?.setProperty("timestampProcessingFailed", new Date().toISOString());
				const errorMessage = "Scriptorium failed to process batch, going to restart";
				this.logErrorTelemetry(errorMessage, error, status, batchOffset?.offset, metric);

				// Restart scriptorium
				this.context.error(error, { restart: true });
			},
		);
	}

	private logErrorTelemetry(
		errorMessage: string,
		error: any,
		status: string,
		batchOffset: number | undefined,
		metric: Lumber<LumberEventName.ScriptoriumProcessBatch> | undefined,
	) {
		if (this.telemetryEnabled && metric) {
			metric.setProperty("status", status);
			metric.error(errorMessage, error);
		} else {
			Lumberjack.error(errorMessage, { batchOffset, status }, error);
		}
	}

	private async processMongoCore(messages: ISequencedOperationMessage[], scriptoriumMetricId: string | undefined): Promise<void> {
		return this.insertOp(messages, scriptoriumMetricId);
	}

	private async insertOp(messages: ISequencedOperationMessage[], scriptoriumMetricId: string | undefined) {
		const dbOps = messages.map((message) => ({
			...message,
			mongoTimestamp: new Date(message.operation.timestamp),
		}));

		const documentId = messages[0]?.documentId ?? "";
		const tenantId = messages[0]?.tenantId ?? "";

		const sequenceNumbers = messages.map((message) => message.operation.sequenceNumber);
		const sequenceNumberRanges = convertSortedNumberArrayToRanges(sequenceNumbers);
		const insertBatchSize = dbOps.length;

		return runWithRetry(
			async () => this.opCollection.insertMany(dbOps, false),
			"insertOpScriptorium",
			3 /* maxRetries */,
			1000 /* retryAfterMs */,
			{
				...getLumberBaseProperties(documentId, tenantId),
				...{ sequenceNumberRanges, insertBatchSize, scriptoriumMetricId },
			},
			(error) => error.code === 11000,
			(error) => !this.clientFacadeRetryEnabled /* shouldRetry */,
			undefined /* calculateIntervalMs */,
			undefined /* onErrorFn */,
			this.telemetryEnabled,
		);
	}
}
