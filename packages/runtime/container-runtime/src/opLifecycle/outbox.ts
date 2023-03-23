/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { IContainerContext } from "@fluidframework/container-definitions";
import { GenericError, UsageError } from "@fluidframework/container-utils";
import { MessageType } from "@fluidframework/protocol-definitions";
import {
	ChildLogger,
	loggerToMonitoringContext,
	MonitoringContext,
} from "@fluidframework/telemetry-utils";
import { ICompressionRuntimeOptions } from "../containerRuntime";
import { PendingStateManager } from "../pendingStateManager";
import { BatchManager, estimateSocketSize } from "./batchManager";
import { BatchMessage, IBatch } from "./definitions";
import { OpCompressor } from "./opCompressor";
import { OpGroupingManager } from "./opGroupingManager";
import { OpSplitter } from "./opSplitter";

export interface IOutboxConfig {
	readonly compressionOptions: ICompressionRuntimeOptions;
	// The maximum size of a batch that we can send over the wire.
	readonly maxBatchSizeInBytes: number;
	readonly disablePartialFlush: boolean;
}

export interface IOutboxParameters {
	readonly shouldSend: () => boolean;
	readonly pendingStateManager: PendingStateManager;
	readonly containerContext: IContainerContext;
	readonly config: IOutboxConfig;
	readonly compressor: OpCompressor;
	readonly splitter: OpSplitter;
	readonly logger: ITelemetryLogger;
	readonly groupingManager: OpGroupingManager;
}

export class Outbox {
	private readonly mc: MonitoringContext;
	private readonly attachFlowBatch: BatchManager;
	private readonly mainBatch: BatchManager;
	private readonly defaultAttachFlowSoftLimitInBytes = 320 * 1024;

	/**
	 * Track the number of ops which were detected to have a mismatched
	 * reference sequence number, in order to self-throttle the telemetry events.
	 *
	 * This should be removed as part of ADO:2322
	 */
	private readonly maxMismatchedOpsToReport = 3;
	private mismatchedOpsReported = 0;

	constructor(private readonly params: IOutboxParameters) {
		this.mc = loggerToMonitoringContext(ChildLogger.create(params.logger, "Outbox"));
		const isCompressionEnabled =
			this.params.config.compressionOptions.minimumBatchSizeInBytes !==
			Number.POSITIVE_INFINITY;
		// We need to allow infinite size batches if we enable compression
		const hardLimit = isCompressionEnabled ? Infinity : this.params.config.maxBatchSizeInBytes;
		const softLimit = isCompressionEnabled ? Infinity : this.defaultAttachFlowSoftLimitInBytes;

		this.attachFlowBatch = new BatchManager({ hardLimit, softLimit });
		this.mainBatch = new BatchManager({ hardLimit });
	}

	public get isEmpty(): boolean {
		return this.attachFlowBatch.length === 0 && this.mainBatch.length === 0;
	}

	/**
	 * If we detect that the reference sequence number of the incoming message does not match
	 * what was already in the batch managers, this means that batching has been interrupted so
	 * we will flush the accumulated messages to account for that and create a new batch with the new
	 * message as the first message.
	 *
	 * @param message - the incoming message
	 */
	private maybeFlushPartialBatch(message: BatchMessage) {
		const mainBatchReference = this.mainBatch.referenceSequenceNumber;
		const attachFlowBatchReference = this.attachFlowBatch.referenceSequenceNumber;
		assert(
			this.params.config.disablePartialFlush ||
				mainBatchReference === undefined ||
				attachFlowBatchReference === undefined ||
				mainBatchReference === attachFlowBatchReference,
			0x58d /* Reference sequence numbers from both batches must be in sync */,
		);

		if (
			(mainBatchReference === undefined ||
				mainBatchReference === message.referenceSequenceNumber) &&
			(attachFlowBatchReference === undefined ||
				attachFlowBatchReference === message.referenceSequenceNumber)
		) {
			// The reference sequence numbers are stable, there is nothing to do
			return;
		}

		if (++this.mismatchedOpsReported <= this.maxMismatchedOpsToReport) {
			this.mc.logger.sendErrorEvent(
				{
					eventName: "ReferenceSequenceNumberMismatch",
					mainReferenceSequenceNumber: mainBatchReference,
					attachReferenceSequenceNumber: attachFlowBatchReference,
					messageReferenceSequenceNumber: message.referenceSequenceNumber,
				},
				new UsageError("Submission of an out of order message"),
			);
		}

		if (!this.params.config.disablePartialFlush) {
			this.flush();
		}
	}

	public submit(message: BatchMessage) {
		this.maybeFlushPartialBatch(message);

		if (!this.mainBatch.push(message)) {
			throw new GenericError("BatchTooLarge", /* error */ undefined, {
				opSize: message.contents?.length ?? 0,
				batchSize: this.mainBatch.contentSizeInBytes,
				count: this.mainBatch.length,
				limit: this.mainBatch.options.hardLimit,
			});
		}
	}

	public submitAttach(message: BatchMessage) {
		this.maybeFlushPartialBatch(message);

		if (!this.attachFlowBatch.push(message)) {
			// BatchManager has two limits - soft limit & hard limit. Soft limit is only engaged
			// when queue is not empty.
			// Flush queue & retry. Failure on retry would mean - single message is bigger than hard limit
			this.flushInternal(this.attachFlowBatch.popBatch());
			if (!this.attachFlowBatch.push(message)) {
				throw new GenericError("BatchTooLarge", /* error */ undefined, {
					opSize: message.contents?.length ?? 0,
					batchSize: this.attachFlowBatch.contentSizeInBytes,
					count: this.attachFlowBatch.length,
					limit: this.attachFlowBatch.options.hardLimit,
				});
			}
		}

		// If compression is enabled, we will always successfully receive
		// attach ops and compress then send them at the next JS turn, regardless
		// of the overall size of the accumulated ops in the batch.
		// However, it is more efficient to flush these ops faster, preferably
		// after they reach a size which would benefit from compression.
		if (
			this.attachFlowBatch.contentSizeInBytes >=
			this.params.config.compressionOptions.minimumBatchSizeInBytes
		) {
			this.flushInternal(this.attachFlowBatch.popBatch());
		}
	}

	public flush() {
		this.flushInternal(this.attachFlowBatch.popBatch());
		this.flushInternal(this.mainBatch.popBatch());
	}

	private flushInternal(rawBatch: IBatch) {
		const processedBatch = this.compressBatch(rawBatch);
		this.sendBatch(processedBatch);

		this.persistBatch(rawBatch.content);
	}

	private compressBatch(batch: IBatch): IBatch {
		if (
			batch.content.length === 0 ||
			this.params.config.compressionOptions === undefined ||
			this.params.config.compressionOptions.minimumBatchSizeInBytes >
				batch.contentSizeInBytes ||
			this.params.containerContext.submitBatchFn === undefined
		) {
			// Nothing to do if the batch is empty or if compression is disabled or not supported, or if we don't need to compress
			return this.params.groupingManager.groupBatch(batch);
		}

		const compressedBatch = this.params.groupingManager.groupBatch(
			this.params.compressor.compressBatch(batch),
		);

		if (this.params.splitter.isBatchChunkingEnabled) {
			return compressedBatch.contentSizeInBytes <= this.params.splitter.chunkSizeInBytes
				? compressedBatch
				: this.params.splitter.splitCompressedBatch(compressedBatch);
		}

		if (compressedBatch.contentSizeInBytes >= this.params.config.maxBatchSizeInBytes) {
			throw new GenericError("BatchTooLarge", /* error */ undefined, {
				batchSize: batch.contentSizeInBytes,
				compressedBatchSize: compressedBatch.contentSizeInBytes,
				count: compressedBatch.content.length,
				limit: this.params.config.maxBatchSizeInBytes,
				chunkingEnabled: this.params.splitter.isBatchChunkingEnabled,
				compressionOptions: JSON.stringify(this.params.config.compressionOptions),
				socketSize: estimateSocketSize(batch),
			});
		}

		return compressedBatch;
	}

	/**
	 * Sends the batch object to the container context to be sent over the wire.
	 *
	 * @param batch - batch to be sent
	 */
	private sendBatch(batch: IBatch) {
		const length = batch.content.length;

		// Did we disconnect in the middle of turn-based batch?
		// If so, do nothing, as pending state manager will resubmit it correctly on reconnect.
		if (length === 0 || !this.params.shouldSend()) {
			return;
		}

		const socketSize = estimateSocketSize(batch);
		if (socketSize >= this.params.config.maxBatchSizeInBytes) {
			this.mc.logger.sendPerformanceEvent({
				eventName: "LargeBatch",
				length: batch.content.length,
				sizeInBytes: batch.contentSizeInBytes,
				socketSize,
			});
		}

		if (this.params.containerContext.submitBatchFn === undefined) {
			// Legacy path - supporting old loader versions. Can be removed only when LTS moves above
			// version that has support for batches (submitBatchFn)
			assert(
				batch.content[0].compression === undefined,
				0x5a6 /* Compression should not have happened if the loader does not support it */,
			);

			for (const message of batch.content) {
				this.params.containerContext.submitFn(
					MessageType.Operation,
					message.deserializedContent,
					true, // batch
					message.metadata,
				);
			}

			this.params.containerContext.deltaManager.flush();
		} else {
			assert(
				batch.referenceSequenceNumber !== undefined,
				0x58e /* Batch must not be empty */,
			);
			this.params.containerContext.submitBatchFn(
				batch.content.map((message) => ({
					contents: message.contents,
					metadata: message.metadata,
					compression: message.compression,
					referenceSequenceNumber: message.referenceSequenceNumber,
				})),
				batch.referenceSequenceNumber,
			);
		}
	}

	private persistBatch(batch: BatchMessage[]) {
		// Let the PendingStateManager know that a message was submitted.
		// In future, need to shift toward keeping batch as a whole!
		for (const message of batch) {
			this.params.pendingStateManager.onSubmitMessage(
				message.deserializedContent.type,
				message.referenceSequenceNumber,
				message.deserializedContent.contents,
				message.localOpMetadata,
				message.metadata,
			);
		}
	}

	public checkpoint() {
		return {
			mainBatch: this.mainBatch.checkpoint(),
			attachFlowBatch: this.attachFlowBatch.checkpoint(),
		};
	}
}
