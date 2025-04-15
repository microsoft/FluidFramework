/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBatchMessage } from "@fluidframework/container-definitions/internal";
import {
	ITelemetryBaseLogger,
	type ITelemetryBaseProperties,
} from "@fluidframework/core-interfaces";
import { assert, Lazy } from "@fluidframework/core-utils/internal";
import {
	DataProcessingError,
	UsageError,
	createChildLogger,
	type IFluidErrorBase,
	type ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import { ICompressionRuntimeOptions } from "../containerRuntime.js";
import type { LocalContainerRuntimeMessage } from "../messageTypes.js";
import { PendingMessageResubmitData2, PendingStateManager } from "../pendingStateManager.js";

import {
	BatchManager,
	BatchSequenceNumbers,
	sequenceNumbersMatch,
	type BatchId,
} from "./batchManager.js";
import {
	LocalBatchMessage,
	IBatchCheckpoint,
	type OutboundBatchMessage,
	type OutboundSingletonBatch,
	type LocalBatch,
	type OutboundBatch,
} from "./definitions.js";
import { OpCompressor } from "./opCompressor.js";
import { OpGroupingManager } from "./opGroupingManager.js";
import { serializeOp } from "./opSerialization.js";
import { OpSplitter } from "./opSplitter.js";

export interface IOutboxConfig {
	readonly compressionOptions: ICompressionRuntimeOptions;
	/**
	 * The maximum size of a batch that we can send over the wire.
	 */
	readonly maxBatchSizeInBytes: number;
	/**
	 * If true, maybeFlushPartialBatch will flush the batch if the reference sequence number changed
	 * since the batch started. Otherwise, it will throw in this case (apart from reentrancy which is handled elsewhere).
	 * Once the new throw-based flow is proved in a production environment, this option will be removed.
	 */
	readonly flushPartialBatches: boolean;
}

export interface IOutboxParameters {
	readonly shouldSend: () => boolean;
	readonly pendingStateManager: PendingStateManager;
	readonly submitBatchFn:
		| ((batch: IBatchMessage[], referenceSequenceNumber?: number) => number)
		| undefined;
	readonly legacySendBatchFn: (batch: OutboundBatch) => number;
	readonly config: IOutboxConfig;
	readonly compressor: OpCompressor;
	readonly splitter: OpSplitter;
	readonly logger: ITelemetryBaseLogger;
	readonly groupingManager: OpGroupingManager;
	readonly getCurrentSequenceNumbers: () => BatchSequenceNumbers;
	readonly reSubmit: (message: PendingMessageResubmitData2) => void;
	readonly opReentrancy: () => boolean;
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
 * Convert from local batch to outbound batch, including computing contentSizeInBytes.
 */
export function localBatchToOutboundBatch(localBatch: LocalBatch): OutboundBatch {
	// Shallow copy each message as we switch types
	const outboundMessages = localBatch.messages.map<OutboundBatchMessage>(
		({ runtimeOp, ...message }) => ({
			contents: serializeOp(runtimeOp),
			...message,
		}),
	);
	const contentSizeInBytes = outboundMessages.reduce(
		(acc, message) => acc + (message.contents?.length ?? 0),
		0,
	);

	// Shallow copy the local batch, updating the messages to be outbound messages and adding contentSizeInBytes
	const outboundBatch: OutboundBatch = {
		...localBatch,
		messages: outboundMessages,
		contentSizeInBytes,
	};

	return outboundBatch;
}

/**
 * Estimated size of the stringification overhead for an op accumulated
 * from runtime to loader to the service.
 */
const opOverhead = 200;

/**
 * Estimates the real size in bytes on the socket for a given batch. It assumes that
 * the envelope size (and the size of an empty op) is 200 bytes, taking into account
 * extra overhead from stringification.
 *
 * @remarks
 * Also content will be stringified, and that adds a lot of overhead due to a lot of escape characters.
 * Not taking it into account, as compression work should help there - compressed payload will be
 * initially stored as base64, and that requires only 2 extra escape characters.
 *
 * @param batch - the batch to inspect
 * @returns An estimate of the payload size in bytes which will be produced when the batch is sent over the wire
 */
export const estimateSocketSize = (batch: OutboundBatch): number => {
	return batch.contentSizeInBytes + opOverhead * batch.messages.length;
};

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

		this.mainBatch = new BatchManager({ canRebase: true });
		this.blobAttachBatch = new BatchManager({ canRebase: true });
		this.idAllocationBatch = new BatchManager({
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
	 * we will flush the accumulated messages to account for that (if allowed) and create a new batch with the new
	 * message as the first message. If flushing partial batch is not enabled, we will throw (except for reentrant ops).
	 * This would indicate we expected this case to be precluded by logic elsewhere.
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
			sequenceNumbersMatch(mainBatchSeqNums, blobAttachSeqNums) &&
				sequenceNumbersMatch(mainBatchSeqNums, idAllocSeqNums),
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

		// Reference and/or Client sequence number will be advancing while processing this batch,
		// so we can't use this check to detect wrongdoing. But we will still log via telemetry.
		// This is rare, and the reentrancy will be handled during Flush.
		const expectedDueToReentrancy = this.isContextReentrant();

		const errorWrapper = new Lazy(() =>
			getLongStack(() =>
				DataProcessingError.create(
					"Sequence numbers advanced as if ops were processed while a batch is accumulating",
					"outboxSequenceNumberCoherencyCheck",
				),
			),
		);
		if (++this.mismatchedOpsReported <= this.maxMismatchedOpsToReport) {
			this.logger.sendTelemetryEvent(
				{
					// Only log error if this is truly unexpected
					category:
						expectedDueToReentrancy || this.params.config.flushPartialBatches
							? "generic"
							: "error",
					eventName: "ReferenceSequenceNumberMismatch",
					Data_details: {
						expectedDueToReentrancy,
						mainReferenceSequenceNumber: mainBatchSeqNums.referenceSequenceNumber,
						mainClientSequenceNumber: mainBatchSeqNums.clientSequenceNumber,
						blobAttachReferenceSequenceNumber: blobAttachSeqNums.referenceSequenceNumber,
						blobAttachClientSequenceNumber: blobAttachSeqNums.clientSequenceNumber,
						currentReferenceSequenceNumber: currentSequenceNumbers.referenceSequenceNumber,
						currentClientSequenceNumber: currentSequenceNumbers.clientSequenceNumber,
					},
				},
				errorWrapper.value,
			);
		}

		// If we're configured to flush partial batches, do that now and return (don't throw)
		if (this.params.config.flushPartialBatches) {
			this.flushAll();
			return;
		}

		// If we are in a reentrant context, we know this can happen without causing any harm.
		if (expectedDueToReentrancy) {
			return;
		}

		throw errorWrapper.value;
	}

	public submit(message: LocalBatchMessage): void {
		this.maybeFlushPartialBatch();

		this.addMessageToBatchManager(this.mainBatch, message);
	}

	public submitBlobAttach(message: LocalBatchMessage): void {
		this.maybeFlushPartialBatch();

		this.addMessageToBatchManager(this.blobAttachBatch, message);
	}

	public submitIdAllocation(message: LocalBatchMessage): void {
		this.maybeFlushPartialBatch();

		this.addMessageToBatchManager(this.idAllocationBatch, message);
	}

	private addMessageToBatchManager(
		batchManager: BatchManager,
		message: LocalBatchMessage,
	): void {
		batchManager.push(
			message,
			this.isContextReentrant(),
			this.params.getCurrentSequenceNumbers().clientSequenceNumber,
		);
	}

	/**
	 * Flush all the batches to the ordering service.
	 * This method is expected to be called at the end of a batch.
	 *
	 * @throws If called from a reentrant context, or if the batch being flushed is too large.
	 * @param resubmittingBatchId - If defined, indicates this is a resubmission of a batch
	 * with the given Batch ID, which must be preserved
	 */
	public flush(resubmittingBatchId?: BatchId): void {
		assert(
			!this.isContextReentrant(),
			0xb7b /* Flushing must not happen while incoming changes are being processed */,
		);

		this.flushAll(resubmittingBatchId);
	}

	private flushAll(resubmittingBatchId?: BatchId): void {
		const allBatchesEmpty =
			this.idAllocationBatch.empty && this.blobAttachBatch.empty && this.mainBatch.empty;
		if (allBatchesEmpty) {
			// If we're resubmitting and all batches are empty, we need to flush an empty batch.
			// Note that we currently resubmit one batch at a time, so on resubmit, 2 of the 3 batches will *always* be empty.
			// It's theoretically possible that we don't *need* to resubmit this empty batch, and in those cases, it'll safely be ignored
			// by the rest of the system, including remote clients.
			// In some cases we *must* resubmit the empty batch (to match up with a non-empty version tracked locally by a container fork), so we do it always.
			if (resubmittingBatchId) {
				this.flushEmptyBatch(resubmittingBatchId);
			}
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
		const referenceSequenceNumber =
			this.params.getCurrentSequenceNumbers().referenceSequenceNumber;
		assert(
			referenceSequenceNumber !== undefined,
			0xa01 /* reference sequence number should be defined */,
		);
		const { outboundBatch, placeholderMessage } =
			this.params.groupingManager.createEmptyGroupedBatch(
				resubmittingBatchId,
				referenceSequenceNumber,
			);
		let clientSequenceNumber: number | undefined;
		if (this.params.shouldSend()) {
			clientSequenceNumber = this.sendBatch(outboundBatch);
		}

		// Push the empty batch placeholder to the PendingStateManager
		this.params.pendingStateManager.onFlushBatch(
			[
				{
					...placeholderMessage,
					runtimeOp: undefined as unknown as LocalContainerRuntimeMessage, //* Better idea?
					contents: undefined,
				},
			], // placeholder message - serializedOp will never be used
			clientSequenceNumber,
		);
		return;
	}

	private flushInternal(
		batchManager: BatchManager,
		disableGroupedBatching: boolean = false,
		resubmittingBatchId?: BatchId,
	): void {
		if (batchManager.empty) {
			return;
		}

		const rawBatch = batchManager.popBatch(resubmittingBatchId);
		const groupingEnabled =
			!disableGroupedBatching && this.params.groupingManager.groupedBatchingEnabled();
		if (
			batchManager.options.canRebase &&
			rawBatch.hasReentrantOps === true &&
			// NOTE: This is too restrictive. We should rebase for any reentrant op, not just if it's going to be a grouped batch
			// However there is some test that is depending on this behavior so we haven't removed these conditions yet. See AB#33427
			groupingEnabled &&
			rawBatch.messages.length > 1
		) {
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
			const virtualizedBatch = this.virtualizeBatch(rawBatch, groupingEnabled);

			clientSequenceNumber = this.sendBatch(virtualizedBatch);
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
	private rebase(rawBatch: LocalBatch, batchManager: BatchManager): void {
		assert(!this.rebasing, 0x6fb /* Reentrancy */);
		assert(batchManager.options.canRebase, 0x9a7 /* BatchManager does not support rebase */);

		this.rebasing = true;
		for (const message of rawBatch.messages) {
			this.params.reSubmit({
				viableOp: message.runtimeOp,
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
	 * As necessary and enabled, groups / compresses / chunks the given batch.
	 *
	 * @remarks - If chunking happens, a side effect here is that 1 or more chunks are queued immediately for sending in next JS turn.
	 *
	 * @param localBatch - Local Batch to be virtualized - i.e. transformed into an Outbound Batch
	 * @param groupingEnabled - If true, Grouped batching is enabled.
	 * @returns One of the following:
	 * - (A) The original batch (Based on what's enabled)
	 * - (B) A grouped batch (it's a singleton batch)
	 * - (C) A compressed singleton batch
	 * - (D) A singleton batch containing the last chunk.
	 */
	private virtualizeBatch(localBatch: LocalBatch, groupingEnabled: boolean): OutboundBatch {
		// Shallow copy the local batch, updating the messages to be outbound messages
		const originalBatch = localBatchToOutboundBatch(localBatch);

		const originalOrGroupedBatch = groupingEnabled
			? this.params.groupingManager.groupBatch(originalBatch)
			: originalBatch;

		if (originalOrGroupedBatch.messages.length !== 1) {
			// Compression requires a single message, so return early otherwise.
			return originalOrGroupedBatch;
		}

		// Regardless of whether we grouped or not, we now have a batch with a single message.
		// Now proceed to compress/chunk it if necessary.
		const singletonBatch = originalOrGroupedBatch as OutboundSingletonBatch;

		if (
			this.params.config.compressionOptions.minimumBatchSizeInBytes >
				singletonBatch.contentSizeInBytes ||
			this.params.submitBatchFn === undefined
		) {
			// Nothing to do if compression is disabled, unnecessary or unsupported.
			return singletonBatch;
		}

		const compressedBatch = this.params.compressor.compressBatch(singletonBatch);

		if (this.params.splitter.isBatchChunkingEnabled) {
			return compressedBatch.contentSizeInBytes <= this.params.splitter.chunkSizeInBytes
				? compressedBatch
				: this.params.splitter.splitSingletonBatchMessage(compressedBatch);
		}

		// We want to distinguish this "BatchTooLarge" case from the generic "BatchTooLarge" case in sendBatch
		if (compressedBatch.contentSizeInBytes >= this.params.config.maxBatchSizeInBytes) {
			throw this.makeBatchTooLargeError(compressedBatch, "CompressionInsufficient", {
				uncompressedSizeInBytes: singletonBatch.contentSizeInBytes,
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
	private sendBatch(batch: OutboundBatch): number | undefined {
		const length = batch.messages.length;
		if (length === 0) {
			return undefined; // Nothing submitted
		}

		const socketSize = estimateSocketSize(batch);
		if (socketSize >= this.params.config.maxBatchSizeInBytes) {
			throw this.makeBatchTooLargeError(batch, "CannotSend");
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

	private makeBatchTooLargeError(
		batch: OutboundBatch,
		codepath: string,
		moreDetails?: ITelemetryBaseProperties,
	): IFluidErrorBase {
		return DataProcessingError.create(
			"BatchTooLarge",
			codepath,
			/* sequencedMessage */ undefined,
			{
				errorDetails: {
					opCount: batch.messages.length,
					contentSizeInBytes: batch.contentSizeInBytes,
					socketSize: estimateSocketSize(batch),
					maxBatchSizeInBytes: this.params.config.maxBatchSizeInBytes,
					groupedBatchingEnabled: this.params.groupingManager.groupedBatchingEnabled(),
					compressionOptions: JSON.stringify(this.params.config.compressionOptions),
					chunkingEnabled: this.params.splitter.isBatchChunkingEnabled,
					chunkSizeInBytes: this.params.splitter.chunkSizeInBytes,
					...moreDetails,
				},
			},
		);
	}

	/**
	 * Gets a checkpoint object per batch that facilitates iterating over the batch messages when rolling back.
	 */
	public getBatchCheckpoints(): {
		mainBatch: IBatchCheckpoint;
		idAllocationBatch: IBatchCheckpoint;
		blobAttachBatch: IBatchCheckpoint;
	} {
		// This variable is declared with a specific type so that we have a standard import of the IBatchCheckpoint type.
		// When the type is inferred, the generated .d.ts uses a dynamic import which doesn't resolve.
		const mainBatch: IBatchCheckpoint = this.mainBatch.checkpoint();
		return {
			mainBatch,
			idAllocationBatch: this.idAllocationBatch.checkpoint(),
			blobAttachBatch: this.blobAttachBatch.checkpoint(),
		};
	}
}
