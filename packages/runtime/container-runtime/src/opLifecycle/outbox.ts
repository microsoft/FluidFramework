/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { IContainerContext } from "@fluidframework/container-definitions";
import { GenericError } from "@fluidframework/container-utils";
import { MessageType } from "@fluidframework/protocol-definitions";
import { ICompressionRuntimeOptions } from "../containerRuntime";
import { PendingStateManager } from "../pendingStateManager";
import { BatchManager } from "./batchManager";
import { BatchMessage, IBatch } from "./definitions";
import { OpCompressor } from "./opCompressor";
import { OpSplitter } from "./opSplitter";

export interface IOutboxConfig {
	readonly compressionOptions: ICompressionRuntimeOptions;
	// The maximum size of a batch that we can send over the wire.
	readonly maxBatchSizeInBytes: number;
	readonly enableOpReentryCheck?: boolean;
}

export interface IOutboxParameters {
	readonly shouldSend: () => boolean;
	readonly pendingStateManager: PendingStateManager;
	readonly containerContext: IContainerContext;
	readonly config: IOutboxConfig;
	readonly compressor: OpCompressor;
	readonly splitter: OpSplitter;
	readonly logger: ITelemetryLogger;
}

export class Outbox {
	private readonly attachFlowBatch: BatchManager;
	private readonly mainBatch: BatchManager;
	private readonly defaultAttachFlowSoftLimitInBytes = 64 * 1024;

	constructor(private readonly params: IOutboxParameters) {
		const isCompressionEnabled =
			this.params.config.compressionOptions.minimumBatchSizeInBytes !==
			Number.POSITIVE_INFINITY;
		// We need to allow infinite size batches if we enable compression
		const hardLimit = isCompressionEnabled ? Infinity : this.params.config.maxBatchSizeInBytes;
		const softLimit = isCompressionEnabled ? Infinity : this.defaultAttachFlowSoftLimitInBytes;

		this.attachFlowBatch = new BatchManager(
			{
				hardLimit,
				softLimit,
				enableOpReentryCheck: params.config.enableOpReentryCheck,
			},
			params.logger,
		);
		this.mainBatch = new BatchManager(
			{
				hardLimit,
				enableOpReentryCheck: params.config.enableOpReentryCheck,
			},
			params.logger,
		);
	}

	public get isEmpty(): boolean {
		return this.attachFlowBatch.length === 0 && this.mainBatch.length === 0;
	}

	public submit(message: BatchMessage) {
		if (!this.mainBatch.push(message)) {
			throw new GenericError("BatchTooLarge", /* error */ undefined, {
				opSize: message.contents?.length ?? 0,
				count: this.mainBatch.length,
				limit: this.mainBatch.options.hardLimit,
			});
		}
	}

	public submitAttach(message: BatchMessage) {
		if (!this.attachFlowBatch.push(message)) {
			// BatchManager has two limits - soft limit & hard limit. Soft limit is only engaged
			// when queue is not empty.
			// Flush queue & retry. Failure on retry would mean - single message is bigger than hard limit
			this.flushInternal(this.attachFlowBatch.popBatch());
			if (!this.attachFlowBatch.push(message)) {
				throw new GenericError("BatchTooLarge", /* error */ undefined, {
					opSize: message.contents?.length ?? 0,
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
		const clientSequenceNumber = this.sendBatch(processedBatch);

		this.persistBatch(clientSequenceNumber, rawBatch.content);
	}

	private compressBatch(batch: IBatch): IBatch {
		if (
			batch.content.length === 0 ||
			this.params.config.compressionOptions === undefined ||
			this.params.config.compressionOptions.minimumBatchSizeInBytes > batch.contentSizeInBytes
		) {
			// Nothing to do if the batch is empty or if compression is disabled or if we don't need to compress
			return batch;
		}

		const compressedBatch = this.params.compressor.compressBatch(batch);
		if (compressedBatch.contentSizeInBytes <= this.params.config.maxBatchSizeInBytes) {
			// If we don't reach the maximum supported size of a batch, it can safely be sent as is
			return compressedBatch;
		}

		if (this.params.splitter.isBatchChunkingEnabled) {
			return this.params.splitter.splitCompressedBatch(compressedBatch);
		}

		// If we've reached this point, the runtime would attempt to send a batch larger than the allowed size
		throw new GenericError("BatchTooLarge", /* error */ undefined, {
			opSize: batch.contentSizeInBytes,
			count: batch.content.length,
			limit: this.params.config.maxBatchSizeInBytes,
			compressed: true,
		});
	}

	/**
	 * Sends the batch object to the container context to be sent over the wire.
	 *
	 * @param batch - batch to be sent
	 * @returns the client sequence number of the last batched op which was sent and
	 * -1 if there are no ops or the container cannot send ops.
	 */
	private sendBatch(batch: IBatch): number {
		let clientSequenceNumber: number = -1;
		const length = batch.content.length;

		// Did we disconnect in the middle of turn-based batch?
		// If so, do nothing, as pending state manager will resubmit it correctly on reconnect.
		if (length === 0 || !this.params.shouldSend()) {
			return clientSequenceNumber;
		}

		if (this.params.containerContext.submitBatchFn === undefined) {
			// Legacy path - supporting old loader versions. Can be removed only when LTS moves above
			// version that has support for batches (submitBatchFn)
			for (const message of batch.content) {
				// Legacy path doesn't support compressed payloads and will submit uncompressed payload anyways
				if (message.metadata?.compressed) {
					delete message.metadata.compressed;
				}

				clientSequenceNumber = this.params.containerContext.submitFn(
					MessageType.Operation,
					message.deserializedContent,
					true, // batch
					message.metadata,
				);
			}

			this.params.containerContext.deltaManager.flush();
		} else {
			// returns clientSequenceNumber of last message in a batch
			clientSequenceNumber = this.params.containerContext.submitBatchFn(
				batch.content.map((message) => ({
					contents: message.contents,
					metadata: message.metadata,
					compression: message.compression,
				})),
			);
		}

		// Convert from clientSequenceNumber of last message in the batch to clientSequenceNumber of first message.
		clientSequenceNumber -= length - 1;
		assert(clientSequenceNumber >= 0, 0x3d0 /* clientSequenceNumber can't be negative */);
		return clientSequenceNumber;
	}

	private persistBatch(initialClientSequenceNumber: number, batch: BatchMessage[]) {
		let clientSequenceNumber = initialClientSequenceNumber;
		// Let the PendingStateManager know that a message was submitted.
		// In future, need to shift toward keeping batch as a whole!
		for (const message of batch) {
			this.params.pendingStateManager.onSubmitMessage(
				message.deserializedContent.type,
				clientSequenceNumber,
				message.referenceSequenceNumber,
				message.deserializedContent.contents,
				message.localOpMetadata,
				message.metadata,
			);

			clientSequenceNumber++;
		}
	}

	public checkpoint() {
		return {
			mainBatch: this.mainBatch.checkpoint(),
			attachFlowBatch: this.attachFlowBatch.checkpoint(),
		};
	}
}
