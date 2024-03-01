/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createChildMonitoringContext,
	GenericError,
	MonitoringContext,
	UsageError,
} from "@fluidframework/telemetry-utils";
import { assert } from "@fluidframework/core-utils";
import { IBatchMessage, ICriticalContainerError } from "@fluidframework/container-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { ICompressionRuntimeOptions } from "../containerRuntime.js";
import { IPendingBatchMessage, PendingStateManager } from "../pendingStateManager.js";
import { ContainerMessageType } from "../messageTypes.js";
import {
	BatchManager,
	BatchSequenceNumbers,
	estimateSocketSize,
	sequenceNumbersMatch,
} from "./batchManager.js";
import { BatchMessage, IBatch, IBatchCheckpoint } from "./definitions.js";
import { OpCompressor } from "./opCompressor.js";
import { OpGroupingManager } from "./opGroupingManager.js";
import { OpSplitter } from "./opSplitter.js";

export interface IOutboxConfig {
	readonly compressionOptions: ICompressionRuntimeOptions;
	// The maximum size of a batch that we can send over the wire.
	readonly maxBatchSizeInBytes: number;
	readonly disablePartialFlush: boolean;
}

export interface IOutboxParameters {
	readonly shouldSend: () => boolean;
	readonly pendingStateManager: PendingStateManager;
	readonly submitBatchFn:
		| ((batch: IBatchMessage[], referenceSequenceNumber?: number) => number)
		| undefined;
	readonly legacySendBatchFn: (batch: IBatch) => void;
	readonly config: IOutboxConfig;
	readonly compressor: OpCompressor;
	readonly splitter: OpSplitter;
	readonly logger: ITelemetryBaseLogger;
	readonly groupingManager: OpGroupingManager;
	readonly getCurrentSequenceNumbers: () => BatchSequenceNumbers;
	readonly reSubmit: (message: IPendingBatchMessage) => void;
	readonly opReentrancy: () => boolean;
	readonly closeContainer: (error?: ICriticalContainerError) => void;
}

/**
 * Temporarily increase the stack limit while executing the provided action.
 * If a negative value is provided for `length`, no stack frames will be collected.
 * If Infinity is provided, all frames will be collected.
 *
 * ADO:4663 - add this to the common packages.
 *
 * @param action - action which returns an error
 * @param length - number of stack frames to collect, 50 if unspecified.
 * @returns the result of the action provided
 */
export function getLongStack<T>(action: () => T, length: number = 50): T {
	const errorObj = Error as any;
	if (
		/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
		// ?? is not logically equivalent when the first clause returns false.
		(
			Object.getOwnPropertyDescriptor(errorObj, "stackTraceLimit") ||
			Object.getOwnPropertyDescriptor(Object.getPrototypeOf(errorObj), "stackTraceLimit")
		)?.writable !== true
		/* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
	) {
		return action();
	}

	const originalStackTraceLimit = errorObj.stackTraceLimit;
	try {
		errorObj.stackTraceLimit = length;
		return action();
	} finally {
		errorObj.stackTraceLimit = originalStackTraceLimit;
	}
}

export class Outbox {
	private readonly mc: MonitoringContext;
	private readonly attachFlowBatch: BatchManager;
	private readonly mainBatch: BatchManager;
	private readonly blobAttachBatch: BatchManager;
	private readonly idAllocationBatch: BatchManager;
	private readonly defaultAttachFlowSoftLimitInBytes = 320 * 1024;
	private batchRebasesToReport = 5;
	private rebasing = false;

	/**
	 * Track the number of ops which were detected to have a mismatched
	 * reference sequence number, in order to self-throttle the telemetry events.
	 *
	 * This should be removed as part of ADO:2322
	 */
	private readonly maxMismatchedOpsToReport = 3;
	private mismatchedOpsReported = 0;

	constructor(private readonly params: IOutboxParameters) {
		this.mc = createChildMonitoringContext({ logger: params.logger, namespace: "Outbox" });
		const isCompressionEnabled =
			this.params.config.compressionOptions.minimumBatchSizeInBytes !==
			Number.POSITIVE_INFINITY;
		// We need to allow infinite size batches if we enable compression
		const hardLimit = isCompressionEnabled ? Infinity : this.params.config.maxBatchSizeInBytes;
		const softLimit = isCompressionEnabled ? Infinity : this.defaultAttachFlowSoftLimitInBytes;

		this.attachFlowBatch = new BatchManager({ hardLimit, softLimit });
		this.mainBatch = new BatchManager({ hardLimit });
		this.blobAttachBatch = new BatchManager({ hardLimit });
		this.idAllocationBatch = new BatchManager({ hardLimit });
	}

	public get messageCount(): number {
		return this.attachFlowBatch.length + this.mainBatch.length + this.blobAttachBatch.length;
	}

	public get isEmpty(): boolean {
		return this.messageCount === 0;
	}

	/**
	 * If we detect that the reference sequence number of the incoming message does not match
	 * what was already in the batch managers, this means that batching has been interrupted so
	 * we will flush the accumulated messages to account for that and create a new batch with the new
	 * message as the first message.
	 */
	private maybeFlushPartialBatch() {
		const mainBatchSeqNums = this.mainBatch.sequenceNumbers;
		const attachFlowBatchSeqNums = this.attachFlowBatch.sequenceNumbers;
		const blobAttachSeqNums = this.blobAttachBatch.sequenceNumbers;
		const idAllocSeqNums = this.idAllocationBatch.sequenceNumbers;
		assert(
			this.params.config.disablePartialFlush ||
				(sequenceNumbersMatch(mainBatchSeqNums, attachFlowBatchSeqNums) &&
					sequenceNumbersMatch(mainBatchSeqNums, blobAttachSeqNums) &&
					sequenceNumbersMatch(mainBatchSeqNums, idAllocSeqNums)),
			0x58d /* Reference sequence numbers from both batches must be in sync */,
		);

		const currentSequenceNumbers = this.params.getCurrentSequenceNumbers();

		if (
			sequenceNumbersMatch(mainBatchSeqNums, currentSequenceNumbers) &&
			sequenceNumbersMatch(attachFlowBatchSeqNums, currentSequenceNumbers) &&
			sequenceNumbersMatch(blobAttachSeqNums, currentSequenceNumbers) &&
			sequenceNumbersMatch(idAllocSeqNums, currentSequenceNumbers)
		) {
			// The reference sequence numbers are stable, there is nothing to do
			return;
		}

		if (++this.mismatchedOpsReported <= this.maxMismatchedOpsToReport) {
			this.mc.logger.sendTelemetryEvent(
				{
					category: this.params.config.disablePartialFlush ? "error" : "generic",
					eventName: "ReferenceSequenceNumberMismatch",
					mainReferenceSequenceNumber: mainBatchSeqNums.referenceSequenceNumber,
					mainClientSequenceNumber: mainBatchSeqNums.clientSequenceNumber,
					attachReferenceSequenceNumber: attachFlowBatchSeqNums.referenceSequenceNumber,
					attachClientSequenceNumber: attachFlowBatchSeqNums.clientSequenceNumber,
					blobAttachReferenceSequenceNumber: blobAttachSeqNums.referenceSequenceNumber,
					blobAttachClientSequenceNumber: blobAttachSeqNums.clientSequenceNumber,
					currentReferenceSequenceNumber: currentSequenceNumbers.referenceSequenceNumber,
					currentClientSequenceNumber: currentSequenceNumbers.clientSequenceNumber,
				},
				getLongStack(() => new UsageError("Submission of an out of order message")),
			);
		}

		if (!this.params.config.disablePartialFlush) {
			this.flushAll();
		}
	}

	public submit(message: BatchMessage) {
		assert(
			message.type !== ContainerMessageType.IdAllocation,
			"Allocation message submitted to mainBatch.",
		);
		this.maybeFlushPartialBatch();

		this.addMessageToBatchManager(this.mainBatch, message);
	}

	public submitAttach(message: BatchMessage) {
		assert(
			message.type === ContainerMessageType.Attach,
			"Non attach message submitted to attachFlowBatch.",
		);
		this.maybeFlushPartialBatch();

		if (
			!this.attachFlowBatch.push(
				message,
				this.isContextReentrant(),
				this.params.getCurrentSequenceNumbers().clientSequenceNumber,
			)
		) {
			// BatchManager has two limits - soft limit & hard limit. Soft limit is only engaged
			// when queue is not empty.
			// Flush queue & retry. Failure on retry would mean - single message is bigger than hard limit
			this.flushInternal(this.attachFlowBatch);

			this.addMessageToBatchManager(this.attachFlowBatch, message);
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
			this.flushInternal(this.attachFlowBatch);
		}
	}

	public submitBlobAttach(message: BatchMessage) {
		assert(
			message.type === ContainerMessageType.BlobAttach,
			"Non blobAttach message submitted to blobAttachBatch.",
		);
		this.maybeFlushPartialBatch();

		this.addMessageToBatchManager(this.blobAttachBatch, message);

		// If compression is enabled, we will always successfully receive
		// blobAttach ops and compress then send them at the next JS turn, regardless
		// of the overall size of the accumulated ops in the batch.
		// However, it is more efficient to flush these ops faster, preferably
		// after they reach a size which would benefit from compression.
		if (
			this.blobAttachBatch.contentSizeInBytes >=
			this.params.config.compressionOptions.minimumBatchSizeInBytes
		) {
			this.flushInternal(this.blobAttachBatch);
		}
	}

	public submitIdAllocation(message: BatchMessage) {
		assert(
			message.type === ContainerMessageType.IdAllocation,
			"Non allocation message submitted to idAllocationBatch.",
		);
		this.maybeFlushPartialBatch();

		if (
			!this.idAllocationBatch.push(
				message,
				this.isContextReentrant(),
				this.params.getCurrentSequenceNumbers().clientSequenceNumber,
			)
		) {
			// BatchManager has two limits - soft limit & hard limit. Soft limit is only engaged
			// when queue is not empty.
			// Flush queue & retry. Failure on retry would mean - single message is bigger than hard limit
			this.flushInternal(this.idAllocationBatch);

			this.addMessageToBatchManager(this.idAllocationBatch, message);
		}

		// If compression is enabled, we will always successfully receive
		// attach ops and compress then send them at the next JS turn, regardless
		// of the overall size of the accumulated ops in the batch.
		// However, it is more efficient to flush these ops faster, preferably
		// after they reach a size which would benefit from compression.
		if (
			this.idAllocationBatch.contentSizeInBytes >=
			this.params.config.compressionOptions.minimumBatchSizeInBytes
		) {
			this.flushInternal(this.idAllocationBatch);
		}
	}

	private addMessageToBatchManager(batchManager: BatchManager, message: BatchMessage) {
		if (
			!batchManager.push(
				message,
				this.isContextReentrant(),
				this.params.getCurrentSequenceNumbers().clientSequenceNumber,
			)
		) {
			throw new GenericError("BatchTooLarge", /* error */ undefined, {
				opSize: message.contents?.length ?? 0,
				batchSize: batchManager.contentSizeInBytes,
				count: batchManager.length,
				limit: batchManager.options.hardLimit,
			});
		}
	}

	public flush() {
		if (this.isContextReentrant()) {
			const error = new UsageError("Flushing is not supported inside DDS event handlers");
			this.params.closeContainer(error);
			throw error;
		}

		this.flushAll();
	}

	private flushAll() {
		this.flushInternal(this.idAllocationBatch);
		this.flushInternal(this.attachFlowBatch);
		this.flushInternal(this.blobAttachBatch, true /* disableGroupedBatching */);
		this.flushInternal(this.mainBatch);
	}

	private flushInternal(batchManager: BatchManager, disableGroupedBatching: boolean = false) {
		if (batchManager.empty) {
			return;
		}

		const rawBatch = batchManager.popBatch();
		if (
			rawBatch.hasReentrantOps === true &&
			this.params.groupingManager.shouldGroup(rawBatch)
		) {
			assert(!this.rebasing, 0x6fa /* A rebased batch should never have reentrant ops */);
			// If a batch contains reentrant ops (ops created as a result from processing another op)
			// it needs to be rebased so that we can ensure consistent reference sequence numbers
			// and eventual consistency at the DDS level.
			this.rebase(rawBatch, batchManager);
			return;
		}

		const processedBatch = this.compressBatch(rawBatch, disableGroupedBatching);
		this.sendBatch(processedBatch);

		this.persistBatch(rawBatch.content);
	}

	/**
	 * Rebases a batch. All the ops in the batch are resubmitted to the runtime and
	 * they will end up back in the same batch manager they were flushed from and subsequently flushed.
	 *
	 * @param rawBatch - the batch to be rebased
	 */
	private rebase(rawBatch: IBatch, batchManager: BatchManager) {
		assert(!this.rebasing, 0x6fb /* Reentrancy */);

		this.rebasing = true;
		for (const message of rawBatch.content) {
			this.params.reSubmit({
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				content: message.contents!,
				localOpMetadata: message.localOpMetadata,
				opMetadata: message.metadata,
			});
		}

		if (this.batchRebasesToReport > 0) {
			this.mc.logger.sendTelemetryEvent(
				{
					eventName: "BatchRebase",
					length: rawBatch.content.length,
					referenceSequenceNumber: rawBatch.referenceSequenceNumber,
				},
				new UsageError("BatchRebase"),
			);
			this.batchRebasesToReport--;
		}

		this.flushInternal(batchManager);
		this.rebasing = false;
	}

	private isContextReentrant(): boolean {
		return this.params.opReentrancy() && !this.rebasing;
	}

	private compressBatch(batch: IBatch, disableGroupedBatching: boolean): IBatch {
		if (
			batch.content.length === 0 ||
			this.params.config.compressionOptions === undefined ||
			this.params.config.compressionOptions.minimumBatchSizeInBytes >
				batch.contentSizeInBytes ||
			this.params.submitBatchFn === undefined
		) {
			// Nothing to do if the batch is empty or if compression is disabled or not supported, or if we don't need to compress
			return disableGroupedBatching ? batch : this.params.groupingManager.groupBatch(batch);
		}

		const compressedBatch = this.params.compressor.compressBatch(
			disableGroupedBatching ? batch : this.params.groupingManager.groupBatch(batch),
		);

		if (this.params.splitter.isBatchChunkingEnabled) {
			return compressedBatch.contentSizeInBytes <= this.params.splitter.chunkSizeInBytes
				? compressedBatch
				: this.params.splitter.splitFirstBatchMessage(compressedBatch);
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

		if (this.params.submitBatchFn === undefined) {
			// Legacy path - supporting old loader versions. Can be removed only when LTS moves above
			// version that has support for batches (submitBatchFn)
			assert(
				batch.content[0].compression === undefined,
				0x5a6 /* Compression should not have happened if the loader does not support it */,
			);

			this.params.legacySendBatchFn(batch);
		} else {
			assert(
				batch.referenceSequenceNumber !== undefined,
				0x58e /* Batch must not be empty */,
			);
			this.params.submitBatchFn(
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
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				message.contents!,
				message.referenceSequenceNumber,
				message.localOpMetadata,
				message.metadata,
			);
		}
	}

	public checkpoint() {
		// This variable is declared with a specific type so that we have a standard import of the IBatchCheckpoint type.
		// When the type is inferred, the generated .d.ts uses a dynamic import which doesn't resolve.
		const mainBatch: IBatchCheckpoint = this.mainBatch.checkpoint();
		return {
			mainBatch,
			attachFlowBatch: this.attachFlowBatch.checkpoint(),
			blobAttachBatch: this.blobAttachBatch.checkpoint(),
		};
	}
}
