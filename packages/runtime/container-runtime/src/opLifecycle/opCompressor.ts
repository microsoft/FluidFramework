/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from "@fluid-internal/client-utils";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	UsageError,
	createChildLogger,
	type ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";
import { compress } from "lz4js";

import { CompressionAlgorithms } from "../containerRuntime.js";

import { estimateSocketSize } from "./batchManager.js";
import { BatchMessage, IBatch } from "./definitions.js";

/**
 * Compresses batches of ops.
 *
 * @remarks Only single-message batches are supported
 * Use opGroupingManager to group a batch into a singleton batch suitable for compression.
 */
export class OpCompressor {
	private readonly logger: ITelemetryLoggerExt;

	constructor(logger: ITelemetryBaseLogger) {
		this.logger = createChildLogger({ logger, namespace: "OpCompressor" });
	}

	/**
	 * Combines the contents of the singleton batch into a single JSON string and compresses it, putting
	 * the resulting string as the message contents in place of the original uncompressed payload.
	 * @param batch - The batch to compress. Must have only 1 message
	 * @returns A singleton batch containing a single compressed message
	 */
	public compressBatch(batch: IBatch<[BatchMessage]>): IBatch<[BatchMessage]> {
		assert(
			batch.contentSizeInBytes > 0 && batch.messages.length === 1,
			0x5a4 /* Batch should not be empty and should contain a single message */,
		);

		const compressionStart = Date.now();
		const contentsAsBuffer = new TextEncoder().encode(this.serializeBatchContents(batch));
		const compressedContents = compress(contentsAsBuffer);
		const compressedContent = IsoBuffer.from(compressedContents).toString("base64");
		const duration = Date.now() - compressionStart;

		const messages: [BatchMessage] = [
			{
				...batch.messages[0],
				contents: JSON.stringify({ packedContents: compressedContent }),
				metadata: batch.messages[0].metadata,
				compression: CompressionAlgorithms.lz4,
			},
		];

		const compressedBatch = {
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
	private serializeBatchContents(batch: IBatch<[BatchMessage]>): string {
		const [message, ...none] = batch.messages;
		assert(none.length === 0, "Batch should only contain a single message");
		try {
			// This is expressed as a JSON array, for legacy reasons
			return `[${message.contents}]`;
		} catch (newError: unknown) {
			if ((newError as Partial<Error>).message === "Invalid string length") {
				// This is how string interpolation signals that
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

			throw newError;
		}
	}
}
