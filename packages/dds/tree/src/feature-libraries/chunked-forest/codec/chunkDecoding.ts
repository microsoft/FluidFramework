/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase, oob } from "@fluidframework/core-utils/internal";

import { DiscriminatedUnionDispatcher } from "../../../codec/index.js";
import type {
	FieldKey,
	TreeNodeSchemaIdentifier,
	Value,
	TreeChunk,
} from "../../../core/index.js";
import { assertValidIndex } from "../../../util/index.js";
import { BasicChunk } from "../basicChunk.js";
import { emptyChunk } from "../emptyChunk.js";
import { SequenceChunk } from "../sequenceChunk.js";

import {
	type ChunkDecoder,
	type StreamCursor,
	getChecked,
	readStream,
	readStreamBoolean,
	readStreamNumber,
	readStreamStream,
	readStreamValue,
} from "./chunkCodecUtilities.js";
import {
	DecoderContext,
	decode as genericDecode,
	readStreamIdentifier,
} from "./chunkDecodingGeneric.js";
import {
	type EncodedAnyShape,
	type EncodedChunkShape,
	type EncodedFieldBatch,
	type EncodedInlineArray,
	type EncodedNestedArray,
	type EncodedTreeShape,
	type EncodedValueShape,
	SpecialField,
} from "./format.js";
import type {
	IIdCompressor,
	OpSpaceCompressedId,
	SessionId,
} from "@fluidframework/id-compressor";

export interface IdDecodingContext {
	idCompressor: IIdCompressor;
	/**
	 * The creator of any local Ids to be decoded.
	 */
	originatorId: SessionId;
}
/**
 * Decode `chunk` into a TreeChunk.
 */
export function decode(
	chunk: EncodedFieldBatch,
	idDecodingContext: { idCompressor: IIdCompressor; originatorId: SessionId },
): TreeChunk[] {
	return genericDecode(
		decoderLibrary,
		new DecoderContext(chunk.identifiers, chunk.shapes, idDecodingContext),
		chunk,
		anyDecoder,
	);
}

const decoderLibrary = new DiscriminatedUnionDispatcher<
	EncodedChunkShape,
	[cache: DecoderContext<EncodedChunkShape>],
	ChunkDecoder
>({
	a(shape: EncodedNestedArray, cache): ChunkDecoder {
		return new NestedArrayDecoder(shape);
	},
	b(shape: EncodedInlineArray, cache): ChunkDecoder {
		return new InlineArrayDecoder(shape);
	},
	c(shape: EncodedTreeShape, cache): ChunkDecoder {
		return new TreeDecoder(shape, cache);
	},
	d(shape: EncodedAnyShape): ChunkDecoder {
		return anyDecoder;
	},
});

/**
 * Decode a node's value from `stream` using its shape.
 */
export function readValue(
	stream: StreamCursor,
	shape: EncodedValueShape,
	idDecodingContext: IdDecodingContext,
): Value {
	if (shape === undefined) {
		return readStreamBoolean(stream) ? readStreamValue(stream) : undefined;
	} else {
		if (shape === true) {
			return readStreamValue(stream);
		} else if (shape === false) {
			return undefined;
		} else if (Array.isArray(shape)) {
			assert(shape.length === 1, 0x734 /* expected a single constant for value */);
			return shape[0] as Value;
		} else if (shape === SpecialField.Identifier) {
			// This case is a special case handling the decoding of identifier fields.
			const streamValue = readStream(stream);
			assert(
				typeof streamValue === "number" || typeof streamValue === "string",
				0x997 /* identifier must be string or number. */,
			);
			const idCompressor = idDecodingContext.idCompressor;
			// We cannot persist the type OpSpaceCompressedId, as the user could pass in an invalid string as their id.
			// However, if it is a number with the SpecialField.Identifier shape, it is guaranteed to be a OpSpaceCompressedId that was casted to type number.
			return typeof streamValue === "number"
				? idCompressor.decompress(
						idCompressor.normalizeToSessionSpace(
							streamValue as OpSpaceCompressedId,
							idDecodingContext.originatorId,
						),
					)
				: streamValue;
		} else {
			// EncodedCounter case:
			unreachableCase(shape, "decoding values as deltas is not yet supported");
		}
	}
}

/**
 * Normalize a {@link TreeChunk} into an array.
 *
 * Unwraps {@link SequenceChunk}s, and wraps other chunks.
 */
export function deaggregateChunks(chunk: TreeChunk): TreeChunk[] {
	if (chunk === emptyChunk) {
		return [];
	}
	// TODO: when handling of SequenceChunks has better performance (for example in cursors),
	// consider keeping SequenceChunks here if they are longer than some threshold.
	if (chunk instanceof SequenceChunk) {
		// Could return [] here, however the logic in this file is designed to never produce an empty SequenceChunk, so its better to throw an error here to detect bugs.
		assert(chunk.subChunks.length > 0, 0x735 /* Unexpected empty sequence */);
		// Logic in this file is designed to never produce an unneeded (single item) SequenceChunks, so its better to throw an error here to detect bugs.
		assert(chunk.subChunks.length > 1, 0x736 /* Unexpected single item sequence */);

		for (const sub of chunk.subChunks) {
			// The logic in this file is designed to never produce an nested SequenceChunks or emptyChunk, so its better to throw an error here to detect bugs.
			assert(!(sub instanceof SequenceChunk), 0x737 /* unexpected nested sequence */);
			assert(sub !== emptyChunk, 0x738 /* unexpected empty chunk */);

			sub.referenceAdded();
		}

		chunk.referenceRemoved();
		return chunk.subChunks;
	} else {
		return [chunk];
	}
}

/**
 * Normalize a {@link TreeChunk}[] into a single TreeChunk.
 *
 * Avoids creating nested or less than 2 child {@link SequenceChunk}s.
 */
export function aggregateChunks(input: TreeChunk[]): TreeChunk {
	const chunks = input.flatMap(deaggregateChunks);
	switch (chunks.length) {
		case 0:
			return emptyChunk;
		case 1:
			return chunks[0] ?? oob();
		default:
			return new SequenceChunk(chunks);
	}
}

/**
 * Decoder for {@link EncodedNestedArray}s.
 */
export class NestedArrayDecoder implements ChunkDecoder {
	public constructor(private readonly shape: EncodedNestedArray) {}
	public decode(decoders: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk {
		const decoder = decoders[this.shape] ?? oob();

		// TODO: uniform chunk fast path
		const chunks: TreeChunk[] = [];

		const data = readStream(stream);
		if (typeof data === "number") {
			// This case means that the array contained only 0-sized items, and was thus encoded as the length of the array.
			const inner = { data: [], offset: 0 };
			for (let index = 0; index < data; index++) {
				chunks.push(decoder.decode(decoders, inner));
			}
		} else {
			assert(
				Array.isArray(data),
				0x739 /* expected number of array for encoding of nested array */,
			);
			const inner = { data, offset: 0 };
			while (inner.offset !== inner.data.length) {
				chunks.push(decoder.decode(decoders, inner));
			}
		}

		return aggregateChunks(chunks);
	}
}

/**
 * Decoder for {@link EncodedInlineArray}s.
 */
export class InlineArrayDecoder implements ChunkDecoder {
	public constructor(private readonly shape: EncodedInlineArray) {}
	public decode(decoders: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk {
		const length = this.shape.length;
		const decoder = decoders[this.shape.shape] ?? oob();
		const chunks: TreeChunk[] = [];
		for (let index = 0; index < length; index++) {
			chunks.push(decoder.decode(decoders, stream));
		}
		return aggregateChunks(chunks);
	}
}

/**
 * Decoder for {@link EncodedAnyShape}s.
 */
export const anyDecoder: ChunkDecoder = {
	decode(decoders: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk {
		const shapeIndex = readStreamNumber(stream);
		const decoder = getChecked(decoders, shapeIndex);
		return decoder.decode(decoders, stream);
	},
};

/**
 * Decoder for field.
 */
type BasicFieldDecoder = (
	decoders: readonly ChunkDecoder[],
	stream: StreamCursor,
) => [FieldKey, TreeChunk];

/**
 * Get a decoder for fields of a provided (via `shape` and `cache`) {@link EncodedChunkShape}.
 */
function fieldDecoder(
	cache: DecoderContext<EncodedChunkShape>,
	key: FieldKey,
	shape: number,
): BasicFieldDecoder {
	assertValidIndex(shape, cache.shapes);
	return (decoders, stream) => {
		const decoder = decoders[shape] ?? oob();
		return [key, decoder.decode(decoders, stream)];
	};
}

/**
 * Decoder for {@link EncodedTreeShape}s.
 */
export class TreeDecoder implements ChunkDecoder {
	private readonly type?: TreeNodeSchemaIdentifier;
	private readonly fieldDecoders: readonly BasicFieldDecoder[];
	public constructor(
		private readonly shape: EncodedTreeShape,
		private readonly cache: DecoderContext<EncodedChunkShape>,
	) {
		this.type = shape.type === undefined ? undefined : cache.identifier(shape.type);

		const fieldDecoders: BasicFieldDecoder[] = [];
		for (const [fieldKey, fieldShape] of shape.fields ?? []) {
			const key: FieldKey = cache.identifier(fieldKey);
			fieldDecoders.push(fieldDecoder(cache, key, fieldShape));
		}
		this.fieldDecoders = fieldDecoders;
	}
	public decode(decoders: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk {
		const type: TreeNodeSchemaIdentifier =
			this.type ?? readStreamIdentifier(stream, this.cache);
		// TODO: Consider typechecking against stored schema in here somewhere.

		const value = readValue(stream, this.shape.value, this.cache.idDecodingContext);
		const fields: Map<FieldKey, TreeChunk[]> = new Map();

		// Helper to add fields, but with unneeded array chunks removed.
		function addField(key: FieldKey, data: TreeChunk): void {
			// TODO: when handling of ArrayChunks has better performance (for example in cursors),
			// consider keeping array chunks here if they are longer than some threshold.
			const chunks = deaggregateChunks(data);

			if (chunks.length !== 0) {
				fields.set(key, chunks);
			}
		}

		for (const field of this.fieldDecoders) {
			const [key, content] = field(decoders, stream);
			addField(key, content);
		}

		if (this.shape.extraFields !== undefined) {
			const decoder = decoders[this.shape.extraFields] ?? oob();
			const inner = readStreamStream(stream);
			while (inner.offset !== inner.data.length) {
				const key: FieldKey = readStreamIdentifier(inner, this.cache);
				addField(key, decoder.decode(decoders, inner));
			}
		}

		return new BasicChunk(type, fields, value);
	}
}
