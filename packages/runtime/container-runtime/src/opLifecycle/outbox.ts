/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { IBatchMessage } from "@fluidframework/container-definitions/internal";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	GenericError,
	UsageError,
	createChildLogger,
	type ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import { ICompressionRuntimeOptions } from "../containerRuntime.js";
import { OutboundContainerRuntimeMessage } from "../messageTypes.js";
import { PendingMessageResubmitData, PendingStateManager } from "../pendingStateManager.js";

import {
	BatchManager,
	BatchSequenceNumbers,
	estimateSocketSize,
	sequenceNumbersMatch,
	type BatchId,
} from "./batchManager.js";
import { BatchMessage, IBatch, IBatchCheckpoint } from "./definitions.js";
import { OpCompressor } from "./opCompressor.js";
import { OpGroupingManager } from "./opGroupingManager.js";
import { OpSplitter } from "./opSplitter.js";
// eslint-disable-next-line unused-imports/no-unused-imports -- Used by "@link" comment annotation below
import { ensureContentsDeserialized } from "./remoteMessageProcessor.js";

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
	readonly legacySendBatchFn: (batch: IBatch) => number;
	readonly config: IOutboxConfig;
	readonly compressor: OpCompressor;
	readonly splitter: OpSplitter;
	readonly logger: ITelemetryBaseLogger;
	readonly groupingManager: OpGroupingManager;
	readonly getCurrentSequenceNumbers: () => BatchSequenceNumbers;
	readonly reSubmit: (message: PendingMessageResubmitData) => void;
	readonly opReentrancy: () => boolean;
	readonly closeContainer: (error?: ICriticalContainerError) => void;
	readonly rollback: (message: BatchMessage) => void;
}

/**
 * Before submitting an op to the Outbox, its contents must be serialized using this function.
 * @remarks - The deserialization on process happens via the function {@link ensureContentsDeserialized}.
 */
export function serializeOpContents(contents: OutboundContainerRuntimeMessage): string {
	return JSON.stringify(contents);
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
	// TODO: better typing here
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
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

	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
	const originalStackTraceLimit = errorObj.stackTraceLimit;
	try {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		errorObj.stackTraceLimit = length;
		return action();
	} finally {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
		errorObj.stackTraceLimit = originalStackTraceLimit;
	}
}

/**
 * The Outbox collects messages submitted by the ContainerRuntime into a batch,
 * and then flushes the batch when requested.
 *
 * @remarks There are actually multiple independent batches (some are for a specific message type),
 * to support slight variation in semantics for each batch (e.g. support for rebasing or grouping).
 */
export class Outbox {
	private readonly logger: ITelemetryLoggerExt;
	private readonly mainBatch: BatchManager;
	private readonly blobAttachBatch: BatchManager;
	private readonly idAllocationBatch: BatchManager;
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
		this.logger = createChildLogger({ logger: params.logger, namespace: "Outbox" });

		const isCompressionEnabled =
			this.params.config.compressionOptions.minimumBatchSizeInBytes !==
			Number.POSITIVE_INFINITY;
		// We need to allow infinite size batches if we enable compression
		const hardLimit = isCompressionEnabled
			? Number.POSITIVE_INFINITY
			: this.params.config.maxBatchSizeInBytes;

		this.mainBatch = new BatchManager({
			hardLimit,
			canRebase: true,
			rollback: params.rollback,
		});
		//* TODO: Figure out rollback requirements/impl for these two batch managers
		this.blobAttachBatch = new BatchManager({ hardLimit, canRebase: true });
		this.idAllocationBatch = new BatchManager({
			hardLimit,
			canRebase: false,
			ignoreBatchId: true,
		});
	}

	public get messageCount(): number {
		return this.mainBatch.length + this.blobAttachBatch.length + this.idAllocationBatch.length;
	}

	public get mainBatchMessageCount(): number {
		return this.mainBatch.length;
	}

	public get blobAttachBatchMessageCount(): number {
		return this.blobAttachBatch.length;
	}

	public get idAllocationBatchMessageCount(): number {
		return this.idAllocationBatch.length;
	}

	public get isEmpty(): boolean {
		return this.messageCount === 0;
	}

	/**
	 * Detect whether batching has been interrupted by an incoming message being processed. In this case,
	 * we will flush the accumulated messages to account for that and create a new batch with the new
	 * message as the first message.
	 *
	 * @remarks - To detect batch interruption, we compare both the reference sequence number
	 * (i.e. last message processed by DeltaManager) and the client sequence number of the
	 * last message processed by the ContainerRuntime. In the absence of op reentrancy, this
	 * pair will remain stable during a single JS turn during which the batch is being built up.
	 */
	private maybeFlushPartialBatch(): void {
		const mainBatchSeqNums = this.mainBatch.sequenceNumbers;
		const blobAttachSeqNums = this.blobAttachBatch.sequenceNumbers;
		const idAllocSeqNums = this.idAllocationBatch.sequenceNumbers;
		assert(
			this.params.config.disablePartialFlush ||
				(sequenceNumbersMatch(mainBatchSeqNums, blobAttachSeqNums) &&
					sequenceNumbersMatch(mainBatchSeqNums, idAllocSeqNums)),
			0x58d /* Reference sequence numbers from both batches must be in sync */,
		);

		const currentSequenceNumbers = this.params.getCurrentSequenceNumbers();

		if (
			sequenceNumbersMatch(mainBatchSeqNums, currentSequenceNumbers) &&
			sequenceNumbersMatch(blobAttachSeqNums, currentSequenceNumbers) &&
			sequenceNumbersMatch(idAllocSeqNums, currentSequenceNumbers)
		) {
			// The reference sequence numbers are stable, there is nothing to do
			return;
		}

		if (++this.mismatchedOpsReported <= this.maxMismatchedOpsToReport) {
			this.logger.sendTelemetryEvent(
				{
					category: this.params.config.disablePartialFlush ? "error" : "generic",
					eventName: "ReferenceSequenceNumberMismatch",
					mainReferenceSequenceNumber: mainBatchSeqNums.referenceSequenceNumber,
					mainClientSequenceNumber: mainBatchSeqNums.clientSequenceNumber,
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

	public submit(message: BatchMessage): void {
		this.maybeFlushPartialBatch();

		this.addMessageToBatchManager(this.mainBatch, message);
	}

	public submitBlobAttach(message: BatchMessage): void {
		this.maybeFlushPartialBatch();

		this.addMessageToBatchManager(this.blobAttachBatch, message);
	}

	public submitIdAllocation(message: BatchMessage): void {
		this.maybeFlushPartialBatch();

		this.addMessageToBatchManager(this.idAllocationBatch, message);
	}

	private addMessageToBatchManager(batchManager: BatchManager, message: BatchMessage): void {
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

	/**
	 * Flush all the batches to the ordering service.
	 * This method is expected to be called at the end of a batch.
	 * @param resubmittingBatchId - If defined, indicates this is a resubmission of a batch
	 * with the given Batch ID, which must be preserved
	 */
	public flush(resubmittingBatchId?: BatchId): void {
		if (this.blockFlush) {
			return;
		}
		if (this.isContextReentrant()) {
			const error = new UsageError("Flushing is not supported inside DDS event handlers");
			this.params.closeContainer(error);
			throw error;
		}

		this.flushAll(resubmittingBatchId);
	}

	private flushAll(resubmittingBatchId?: BatchId): void {
		if (this.blockFlush) {
			return;
		}
		// If we're resubmitting and all batches are empty, we need to flush an empty batch.
		// Note that we currently resubmit one batch at a time, so on resubmit, 2 of the 3 batches will *always* be empty.
		// It's theoretically possible that we don't *need* to resubmit this empty batch, and in those cases, it'll safely be ignored
		// by the rest of the system, including remote clients.
		// In some cases we *must* resubmit the empty batch (to match up with a non-empty version tracked locally by a container fork), so we do it always.
		const allBatchesEmpty =
			this.idAllocationBatch.empty && this.blobAttachBatch.empty && this.mainBatch.empty;
		if (resubmittingBatchId && allBatchesEmpty) {
			this.flushEmptyBatch(resubmittingBatchId);
			return;
		}
		// Don't use resubmittingBatchId for idAllocationBatch.
		// ID Allocation messages are not directly resubmitted so we don't want to reuse the batch ID.
		this.flushInternal(this.idAllocationBatch);
		this.flushInternal(
			this.blobAttachBatch,
			true /* disableGroupedBatching */,
			resubmittingBatchId,
		);
		this.flushInternal(
			this.mainBatch,
			false /* disableGroupedBatching */,
			resubmittingBatchId,
		);
	}

	private flushEmptyBatch(resubmittingBatchId: BatchId): void {
		if (this.blockFlush) {
			return;
		}
		const referenceSequenceNumber =
			this.params.getCurrentSequenceNumbers().referenceSequenceNumber;
		assert(
			referenceSequenceNumber !== undefined,
			0xa01 /* reference sequence number should be defined */,
		);
		const emptyGroupedBatch = this.params.groupingManager.createEmptyGroupedBatch(
			resubmittingBatchId,
			referenceSequenceNumber,
		);
		let clientSequenceNumber: number | undefined;
		if (this.params.shouldSend()) {
			clientSequenceNumber = this.sendBatch(emptyGroupedBatch);
		}
		this.params.pendingStateManager.onFlushBatch(
			emptyGroupedBatch.messages, // This is the single empty Grouped Batch message
			clientSequenceNumber,
		);
		return;
	}

	private flushInternal(
		batchManager: BatchManager,
		disableGroupedBatching: boolean = false,
		resubmittingBatchId?: BatchId,
	): void {
		if (batchManager.empty || this.blockFlush) {
			return;
		}

		const rawBatch = batchManager.popBatch(resubmittingBatchId);
		const shouldGroup =
			!disableGroupedBatching && this.params.groupingManager.shouldGroup(rawBatch);
		if (batchManager.options.canRebase && rawBatch.hasReentrantOps === true && shouldGroup) {
			assert(!this.rebasing, 0x6fa /* A rebased batch should never have reentrant ops */);
			// If a batch contains reentrant ops (ops created as a result from processing another op)
			// it needs to be rebased so that we can ensure consistent reference sequence numbers
			// and eventual consistency at the DDS level.
			this.rebase(rawBatch, batchManager);
			return;
		}

		let clientSequenceNumber: number | undefined;
		// Did we disconnect? (i.e. is shouldSend false?)
		// If so, do nothing, as pending state manager will resubmit it correctly on reconnect.
		// Because flush() is a task that executes async (on clean stack), we can get here in disconnected state.
		if (this.params.shouldSend()) {
			const processedBatch = disableGroupedBatching
				? rawBatch
				: this.compressAndChunkBatch(
						shouldGroup ? this.params.groupingManager.groupBatch(rawBatch) : rawBatch,
					);
			clientSequenceNumber = this.sendBatch(processedBatch);
			assert(
				clientSequenceNumber === undefined || clientSequenceNumber >= 0,
				0x9d2 /* unexpected negative clientSequenceNumber (empty batch should yield undefined) */,
			);
		}

		this.params.pendingStateManager.onFlushBatch(
			rawBatch.messages,
			clientSequenceNumber,
			batchManager.options.ignoreBatchId,
		);
	}

	/**
	 * Rebases a batch. All the ops in the batch are resubmitted to the runtime and
	 * they will end up back in the same batch manager they were flushed from and subsequently flushed.
	 *
	 * @param rawBatch - the batch to be rebased
	 */
	private rebase(rawBatch: IBatch, batchManager: BatchManager): void {
		assert(!this.rebasing, 0x6fb /* Reentrancy */);
		assert(batchManager.options.canRebase, 0x9a7 /* BatchManager does not support rebase */);

		this.rebasing = true;
		for (const message of rawBatch.messages) {
			this.params.reSubmit({
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				content: message.contents!,
				localOpMetadata: message.localOpMetadata,
				opMetadata: message.metadata,
			});
		}

		if (this.batchRebasesToReport > 0) {
			this.logger.sendTelemetryEvent(
				{
					eventName: "BatchRebase",
					length: rawBatch.messages.length,
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

	/**
	 * As necessary and enabled, compresses and chunks the given batch.
	 *
	 * @remarks - If chunking happens, a side effect here is that 1 or more chunks are queued immediately for sending in next JS turn.
	 *
	 * @param batch - Raw or Grouped batch to consider for compression/chunking
	 * @returns Either (A) the original batch, (B) a compressed batch (same length as original)
	 * or (C) a batch containing the last chunk.
	 */
	private compressAndChunkBatch(batch: IBatch): IBatch {
		if (
			batch.messages.length === 0 ||
			this.params.config.compressionOptions === undefined ||
			this.params.config.compressionOptions.minimumBatchSizeInBytes >
				batch.contentSizeInBytes ||
			this.params.submitBatchFn === undefined ||
			!this.params.groupingManager.groupedBatchingEnabled()
		) {
			// Nothing to do if the batch is empty or if compression is disabled or not supported, or if we don't need to compress
			return batch;
		}

		const compressedBatch = this.params.compressor.compressBatch(batch);

		if (this.params.splitter.isBatchChunkingEnabled) {
			return compressedBatch.contentSizeInBytes <= this.params.splitter.chunkSizeInBytes
				? compressedBatch
				: this.params.splitter.splitFirstBatchMessage(compressedBatch);
		}

		if (compressedBatch.contentSizeInBytes >= this.params.config.maxBatchSizeInBytes) {
			throw new GenericError("BatchTooLarge", /* error */ undefined, {
				batchSize: batch.contentSizeInBytes,
				compressedBatchSize: compressedBatch.contentSizeInBytes,
				count: compressedBatch.messages.length,
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
	 * @returns the clientSequenceNumber of the start of the batch, or undefined if nothing was sent
	 */
	private sendBatch(batch: IBatch): number | undefined {
		const length = batch.messages.length;
		if (length === 0) {
			return undefined; // Nothing submitted
		}

		const socketSize = estimateSocketSize(batch);
		if (socketSize >= this.params.config.maxBatchSizeInBytes) {
			this.logger.sendPerformanceEvent({
				eventName: "LargeBatch",
				length: batch.messages.length,
				sizeInBytes: batch.contentSizeInBytes,
				socketSize,
			});
		}

		let clientSequenceNumber: number;
		if (this.params.submitBatchFn === undefined) {
			// Legacy path - supporting old loader versions. Can be removed only when LTS moves above
			// version that has support for batches (submitBatchFn)
			assert(
				batch.messages[0].compression === undefined,
				0x5a6 /* Compression should not have happened if the loader does not support it */,
			);

			clientSequenceNumber = this.params.legacySendBatchFn(batch);
		} else {
			assert(batch.referenceSequenceNumber !== undefined, 0x58e /* Batch must not be empty */);
			clientSequenceNumber = this.params.submitBatchFn(
				batch.messages.map<IBatchMessage>((message) => ({
					contents: message.contents,
					metadata: message.metadata,
					compression: message.compression,
					referenceSequenceNumber: message.referenceSequenceNumber,
				})),
				batch.referenceSequenceNumber,
			);
		}

		// Convert from clientSequenceNumber of last message in the batch to clientSequenceNumber of first message.
		clientSequenceNumber -= length - 1;
		assert(clientSequenceNumber >= 0, 0x3d0 /* clientSequenceNumber can't be negative */);
		return clientSequenceNumber;
	}

	private blockFlush: boolean = false;
	/**
	 * Gets a checkpoint object per batch that facilitates iterating over the batch messages when rolling back.
	 */
	public getBatchCheckpoints(blockFlush: boolean = false): {
		unblockFlush: () => void;
		mainBatch: IBatchCheckpoint;
		idAllocationBatch: IBatchCheckpoint;
		blobAttachBatch: IBatchCheckpoint;
	} {
		const thisCheckpointBlocksFlush = !this.blockFlush && blockFlush === true;

		if (thisCheckpointBlocksFlush) {
			this.blockFlush = true;
		}

		// This variable is declared with a specific type so that we have a standard import of the IBatchCheckpoint type.
		// When the type is inferred, the generated .d.ts uses a dynamic import which doesn't resolve.
		const mainBatch: IBatchCheckpoint = this.mainBatch.checkpoint();
		return {
			unblockFlush: thisCheckpointBlocksFlush
				? () => {
						this.blockFlush = false;
					}
				: () => {},
			mainBatch,
			idAllocationBatch: this.idAllocationBatch.checkpoint(),
			blobAttachBatch: this.blobAttachBatch.checkpoint(),
		};
	}
}
