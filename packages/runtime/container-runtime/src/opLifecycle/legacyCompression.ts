/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from "@fluid-internal/client-utils";
import { compress } from "lz4js";

import { CompressionAlgorithms } from "../index.js";

import type { BatchMessage, IBatch } from "./definitions.js";

/**
 * Combine the batch's content strings into a single JSON string (a serialized array)
 */
function serializeBatchContents(batch: IBatch): string {
	// Yields a valid JSON array, since each message.contents is already serialized to JSON
	return `[${batch.messages.map(({ contents }) => contents).join(",")}]`;
}

/**
 * This is a helper function that replicates the now deprecated process for compressing a batch that creates empty placeholder messages.
 * It was added since the new process cannot compress a batch with multiple messages, it now only compresses individual messages (which can be a regular message or a grouped one).
 * But we need to ensure the current code still supports READING the old op format (where an old client compressed a multi-message batch)
 * @param batch - batch with messages that are going to be compressed
 * @returns compresed batch with empty placeholder messages
 */
export function compressMultipleMessageBatch(batch: IBatch): IBatch {
	const contentsAsBuffer = new TextEncoder().encode(serializeBatchContents(batch));
	const compressedContents = compress(contentsAsBuffer);
	const compressedContent = IsoBuffer.from(compressedContents).toString("base64");

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
	return compressedBatch;
}
