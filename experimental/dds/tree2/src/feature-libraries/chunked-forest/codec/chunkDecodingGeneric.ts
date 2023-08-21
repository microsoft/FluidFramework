/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { BrandedType } from "../../../util";
import { TreeChunk } from "../chunk";
import { EncodedChunkGeneric, IdentifierOrIndex } from "./formatGeneric";
import {
	ChunkDecoder,
	DiscriminatedUnionDispatcher,
	StreamCursor,
	getChecked,
	readStream,
} from "./chunkCodecUtilities";

/**
 * General purpose shape based tree decoder which gets its support for specific shapes from the caller.
 */
export function decode<TEncodedShape extends object, TCache>(
	decoderLibrary: DiscriminatedUnionDispatcher<TEncodedShape, [cache: TCache], ChunkDecoder>,
	cache: TCache,
	chunk: EncodedChunkGeneric<TEncodedShape>,
	rootDecoder: ChunkDecoder,
): TreeChunk {
	const decoders = chunk.shapes.map((shape) => decoderLibrary.dispatch(shape, cache));
	const stream = { data: chunk.data, offset: 0 };
	const result = rootDecoder.decode(decoders, stream);
	assert(
		stream.offset === stream.data.length,
		0x73a /* expected decode to consume full stream */,
	);
	return result;
}

/**
 * Shared data for use in constructing decoders.
 */
export class DecoderContext<TEncodedShape = unknown> {
	/**
	 * @param identifiers - identifier substitution table (use to replace numeric identifier indexes with the actual identifiers from this table).
	 */
	public constructor(
		public readonly identifiers: readonly string[],
		public readonly shapes: readonly TEncodedShape[],
	) {}

	public identifier<T extends string & BrandedType<string, string>>(
		encoded: IdentifierOrIndex,
	): T {
		if (typeof encoded === "string") {
			return encoded as T;
		}
		return getChecked(this.identifiers, encoded) as T;
	}
}

/**
 * Read one identifier from the stream, advancing the stream offset.
 */
export function readStreamIdentifier<T extends string & BrandedType<string, string>>(
	stream: StreamCursor,
	cache: DecoderContext,
): T {
	const content = readStream(stream);
	assert(
		typeof content === "number" || typeof content === "string",
		0x73b /* content to be a number or string */,
	);
	return cache.identifier(content);
}
