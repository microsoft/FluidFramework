/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { BrandedType } from "../../../util";
import { TreeChunk } from "../chunk";
import { EncodedChunkGeneric } from "./formatGeneric";
import {
	ChunkDecoder,
	DiscriminatedUnionDispatcher,
	StreamCursor,
	getChecked,
	readStream,
} from "./chunkCodecUtilities";

export function decode<TEncodedShape extends object, TCache>(
	decoderLibrary: DiscriminatedUnionDispatcher<TEncodedShape, [cache: TCache], ChunkDecoder>,
	cache: TCache,
	chunk: EncodedChunkGeneric<TEncodedShape>,
	rootDecoder: ChunkDecoder,
): TreeChunk {
	const decoders = chunk.shapes.map((shape) => decoderLibrary.dispatch(shape, cache));
	const stream = { data: chunk.data, offset: 0 };
	const result = rootDecoder.decode(decoders, stream);
	assert(stream.offset === stream.data.length, "expected decode to consume full stream");
	return result;
}

/**
 * Caches shared data for use in constructing decoders.
 */
export class DecoderCache<TEncodedShape = unknown> {
	/**
	 * @param identifiers - identifier substitution table (use to replace numeric identifier indexes with the actual identifiers from this table).
	 *
	 * Unlike the other data stored in this object, identifiers and shapes are not really a cache since the decoders don't any any other way to access this information.
	 */
	public constructor(
		public readonly identifiers: readonly string[],
		public readonly shapes: readonly TEncodedShape[],
	) {}

	public identifier<T extends string & BrandedType<string, string>>(encoded: string | number): T {
		if (typeof encoded === "string") {
			return encoded as T;
		}
		return getChecked(this.identifiers, encoded) as T;
	}
}

export function readStreamIdentifier<T extends string & BrandedType<string, string>>(
	stream: StreamCursor,
	cache: DecoderCache,
): T {
	const content = readStream(stream);
	assert(
		typeof content === "number" || typeof content === "string",
		"content to be a number or string",
	);
	return cache.identifier(content);
}
