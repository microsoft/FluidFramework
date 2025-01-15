/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from "@fluid-internal/client-utils";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { UsageError, createChildLogger } from "@fluidframework/telemetry-utils/internal";
import { compress } from "lz4js";

import { CompressionAlgorithms } from "../containerRuntime.js";

import { estimateSocketSize } from "./batchManager.js";
import { BatchMessage, IBatch } from "./definitions.js";

/**
 * Compresses batches of ops. It generates a single compressed op that contains
 * the contents of each op in the batch. It then submits empty ops for each original
 * op to reserve sequence numbers.
 */
export class OpCompressor {
	private readonly logger;

	constructor(logger: ITelemetryBaseLogger) {
		this.logger = createChildLogger({ logger, namespace: "OpCompressor" });
	}

	/**
	 * Combines the contents of the batch into a single JSON string and compresses it, putting
	 * the resulting string as the first message of the batch. The rest of the messages are
	 * empty placeholders to reserve sequence numbers.
	 * @param batch - The batch to compress
	 * @returns A batch of the same length as the input batch, containing a single compressed message followed by empty placeholders
	 */
	public compressBatch(batch: IBatch): IBatch {
		assert(
			batch.contentSizeInBytes > 0 && batch.messages.length > 0,
			0x5a4 /* Batch should not be empty */,
		);

		const compressionStart = Date.now();
		const contentsAsBuffer = new TextEncoder().encode(this.serializeBatchContents(batch));
		const compressedContents = compress(contentsAsBuffer);
		const compressedContent = IsoBuffer.from(compressedContents).toString("base64");
		const duration = Date.now() - compressionStart;

		const messages: BatchMessage[] = [];
		messages.push({
			...batch.messages[0],
			contents: JSON.stringify({ packedContents: compressedContent }),
			metadata: batch.messages[0].metadata,
			compression: CompressionAlgorithms.lz4,
		});

		// Add empty placeholder messages to reserve the sequence numbers
		for (const message of batch.messages.slice(1)) {
			messages.push({
				localOpMetadata: message.localOpMetadata,
				metadata: message.metadata,
				referenceSequenceNumber: message.referenceSequenceNumber,
			});
		}

		const compressedBatch: IBatch = {
			contentSizeInBytes: compressedContent.length,
			messages,
			referenceSequenceNumber: batch.referenceSequenceNumber,
		};

		if (batch.contentSizeInBytes > 200000) {
			this.logger.sendPerformanceEvent({
				eventName: "CompressedBatch",
				duration,
				sizeBeforeCompression: batch.contentSizeInBytes,
				sizeAfterCompression: compressedBatch.contentSizeInBytes,
				opCount: compressedBatch.messages.length,
				socketSize: estimateSocketSize(compressedBatch),
			});
		}

		return compressedBatch;
	}

	/**
	 * Combine the batch's content strings into a single JSON string (a serialized array)
	 */
	private serializeBatchContents(batch: IBatch): string {
		try {
			// Yields a valid JSON array, since each message.contents is already serialized to JSON
			return `[${batch.messages.map(({ contents }) => contents).join(",")}]`;
		} catch (e: unknown) {
			if ((e as Partial<Error>).message === "Invalid string length") {
				// This is how JSON.stringify signals that
				// the content size exceeds its capacity
				const error = new UsageError("Payload too large");
				this.logger.sendErrorEvent(
					{
						eventName: "BatchTooLarge",
						size: batch.contentSizeInBytes,
						length: batch.messages.length,
					},
					error,
				);
				throw error;
			}

			throw e;
		}
	}
}
