/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { BufferFormat } from "./compressedEncode.js";
import { version, type EncodedFieldBatch } from "./format.js";
import type { ChunkReferenceId, IncrementalEncoder } from "./codecs.js";
import { updateShapesAndIdentifiersEncoding } from "./chunkEncodingGeneric.js";
import type { TreeChunk } from "../../../core/index.js";

/**
 * Used to build data during encoding the forest. Supports incremental encoding where fields that support
 * incremental encoding can encode their chunks separately from the main buffer. See {@link IncrementalEncoder}
 * for more details.
 */
export interface EncodedDataBuilder {
	/**
	 * Indicates whether incremental encoding is supported.
	 * If true, `encodeIncrementalChunk` can be called to encode them separately.
	 * If false, all data must be added to the main buffer.
	 */
	readonly shouldEncodeIncrementally: boolean;
	/**
	 * Add data to the main buffer.
	 */
	addToBuffer(data: BufferFormat[number]): void;
	/**
	 * Called to encode a chunk for a field that supports incremental encoding. If the chunk has not changed since
	 * last encoding and certain other conditions are met, the encoded chunk from the previous encoding will be reused.
	 * Otherwise, the chunk will be encoded using the provided encoder function.
	 * @param chunk - The chunk of data to encode.
	 * @param encoder - A function that encodes the chunk's contents.
	 * @returns The reference ID of the encoded chunk. This should be added to the main buffer and it used to retrieve
	 * the encoded chunk during decoding.
	 * @remarks Must only be called if {@link shouldEncodeIncrementally} is true.
	 */
	encodeIncrementalChunk(
		chunk: TreeChunk,
		encoder: (chunkDataBuilder: EncodedDataBuilder) => void,
	): ChunkReferenceId;
	/**
	 * Create a new builder with the provided buffer. This can be used in scenarios where the data is not directly
	 * added to the main buffer, but goes through some intermediate processing.
	 * @param buffer - The buffer to use for the new builder.
	 * @returns A new instance of EncodedDataBuilder that uses the provided buffer.
	 */
	createFromBuffer(buffer: BufferFormat): EncodedDataBuilder;
}

/**
 * Validates that incremental encoding is enabled and incrementalEncoder is.
 * @param shouldEncodeIncrementally - Whether incremental encoding should be used.
 * @param incrementalEncoder - The incremental encoder to use for encoding chunks.
 */
function validateIncrementalEncodingEnabled(
	shouldEncodeIncrementally: boolean,
	incrementalEncoder: IncrementalEncoder | undefined,
): asserts incrementalEncoder is IncrementalEncoder {
	assert(
		shouldEncodeIncrementally && incrementalEncoder !== undefined,
		"incremental encoding must be enabled",
	);
}

/**
 * Implementation of {@link EncodedDataBuilder} that builds data for the forest.
 * It supports encoding incremental chunks separately from the main buffer.
 * The main buffer is used to store the encoded data, and the incremental encoder is used to encode chunks
 * for fields that support incremental encoding.
 */
export class ForestEncodedDataBuilder implements EncodedDataBuilder {
	public get shouldEncodeIncrementally(): boolean {
		return this.incrementalEncoder !== undefined;
	}
	public constructor(
		private readonly buffer: BufferFormat,
		private readonly incrementalEncoder: IncrementalEncoder | undefined,
	) {}

	/** {@inheritdoc EncodedDataBuilder.addToBuffer} */
	public addToBuffer(data: BufferFormat[number]): void {
		this.buffer.push(data);
	}

	/** {@inheritdoc EncodedDataBuilder.encodeIncrementalChunk} */
	public encodeIncrementalChunk(
		chunk: TreeChunk,
		encoder: (chunkDataBuilder: EncodedDataBuilder) => void,
	): ChunkReferenceId {
		validateIncrementalEncodingEnabled(
			this.shouldEncodeIncrementally,
			this.incrementalEncoder,
		);
		// Encoder for the chunk that encodes its data using the provided encoder function and
		// updates the encoding for shapes and identifiers.
		const chunkEncoder = (): EncodedFieldBatch => {
			const buffer: BufferFormat = [];
			const chunkDataBuilder = new ForestEncodedDataBuilder(buffer, this.incrementalEncoder);
			encoder(chunkDataBuilder);
			return updateShapesAndIdentifiersEncoding(version, [buffer]);
		};
		return this.incrementalEncoder.encodeIncrementalChunk(chunk, chunkEncoder);
	}

	/** {@inheritdoc EncodedDataBuilder.createFromBuffer} */
	public createFromBuffer(buffer: BufferFormat): EncodedDataBuilder {
		return new ForestEncodedDataBuilder(buffer, this.incrementalEncoder);
	}
}
