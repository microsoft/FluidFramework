/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { assertValidIndex } from "../../../util";
import {
	FieldKey,
	GlobalFieldKey,
	LocalFieldKey,
	TreeSchemaIdentifier,
	Value,
	symbolFromKey,
} from "../../../core";
import { TreeChunk } from "../chunk";
import { BasicChunk } from "../basicChunk";
import { SequenceChunk } from "../sequenceChunk";
import { emptyChunk } from "../emptyChunk";
import {
	EncodedAnyShape,
	EncodedChunk,
	EncodedChunkShape,
	EncodedInlineArray,
	EncodedNestedArray,
	EncodedTreeShape,
	EncodedValueShape,
} from "./format";
import {
	ChunkDecoder,
	DiscriminatedUnionDispatcher,
	StreamCursor,
	getChecked,
	readStream,
	readStreamBoolean,
	readStreamNumber,
	readStreamStream,
} from "./chunkCodecUtilities";
import {
	DecoderCache,
	decode as genericDecode,
	readStreamIdentifier,
} from "./chunkDecodingGeneric";

export function decode(chunk: EncodedChunk): TreeChunk {
	return genericDecode(
		decoderLibrary,
		new DecoderCache(chunk.identifiers, chunk.shapes),
		chunk,
		anyDecoder,
	);
}

const decoderLibrary = new DiscriminatedUnionDispatcher<
	EncodedChunkShape,
	[cache: DecoderCache<EncodedChunkShape>],
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

export function readValue(stream: StreamCursor, shape: EncodedValueShape): Value {
	if (shape === undefined) {
		return readStreamBoolean(stream) ? readStream(stream) : undefined;
	} else {
		if (shape === true) {
			return readStream(stream);
		} else if (shape === false) {
			return undefined;
		} else if (Array.isArray(shape)) {
			assert(shape.length === 1, "expected a single constant for value");
			return shape[0] as Value;
		} else {
			// EncodedCounter case:
			unreachableCase(shape, "decoding values as deltas is not yet supported");
		}
	}
}

export function deaggregateChunks(chunk: TreeChunk): TreeChunk[] {
	if (chunk === emptyChunk) {
		return [];
	}
	// TODO: when handling of SequenceChunks has better performance (for example in cursors),
	// consider keeping SequenceChunks here if they are longer than some threshold.
	if (chunk instanceof SequenceChunk) {
		// Could return [] here, however the logic in this file is designed to never produce an empty SequenceChunk, so its better to throw an error here to detect bugs.
		assert(chunk.subChunks.length > 0, "Unexpected empty sequence");
		// Logic in this file is designed to never produce an unneeded (single item) SequenceChunks, so its better to throw an error here to detect bugs.
		assert(chunk.subChunks.length > 1, "Unexpected single item sequence");

		for (const sub of chunk.subChunks) {
			// The logic in this file is designed to never produce an nested SequenceChunks or emptyChunk, so its better to throw an error here to detect bugs.
			assert(!(sub instanceof SequenceChunk), "unexpected nested sequence");
			assert(sub !== emptyChunk, "unexpected empty chunk");

			sub.referenceAdded();
		}

		chunk.referenceRemoved();
		return chunk.subChunks;
	} else {
		return [chunk];
	}
}

export function aggregateChunks(input: TreeChunk[]): TreeChunk {
	const chunks = input.flatMap(deaggregateChunks);
	switch (chunks.length) {
		case 0:
			return emptyChunk;
		case 1:
			return chunks[0];
		default:
			return new SequenceChunk(chunks);
	}
}

export class NestedArrayDecoder implements ChunkDecoder {
	public constructor(private readonly shape: EncodedNestedArray) {}
	public decode(decoders: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk {
		const decoder = decoders[this.shape];

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
			assert(Array.isArray(data), "expected number of array for encoding of nested array");
			const inner = { data, offset: 0 };
			while (inner.offset !== inner.data.length) {
				chunks.push(decoder.decode(decoders, inner));
			}
		}

		return aggregateChunks(chunks);
	}
}

export class InlineArrayDecoder implements ChunkDecoder {
	public constructor(private readonly shape: EncodedInlineArray) {}
	public decode(decoders: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk {
		const length = this.shape.length;
		const decoder = decoders[this.shape.shape];
		const chunks: TreeChunk[] = [];
		for (let index = 0; index < length; index++) {
			chunks.push(decoder.decode(decoders, stream));
		}
		return aggregateChunks(chunks);
	}
}

export const anyDecoder: ChunkDecoder = {
	decode(decoders: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk {
		const shapeIndex = readStreamNumber(stream);
		const decoder = getChecked(decoders, shapeIndex);
		return decoder.decode(decoders, stream);
	},
};

type BasicFieldDecoder = (
	decoders: readonly ChunkDecoder[],
	stream: StreamCursor,
) => [FieldKey, TreeChunk];

function fieldDecoder(
	cache: DecoderCache<EncodedChunkShape>,
	key: FieldKey,
	shape: number,
): BasicFieldDecoder {
	assertValidIndex(shape, cache.shapes);
	return (decoders, stream) => [key, decoders[shape].decode(decoders, stream)];
}

export class TreeDecoder implements ChunkDecoder {
	private readonly type?: TreeSchemaIdentifier;
	private readonly fieldDecoders: readonly BasicFieldDecoder[];
	public constructor(
		private readonly shape: EncodedTreeShape,
		private readonly cache: DecoderCache<EncodedChunkShape>,
	) {
		this.type = shape.type === undefined ? undefined : cache.identifier(shape.type);

		const fieldDecoders: BasicFieldDecoder[] = [];
		for (const field of shape.local) {
			const key: LocalFieldKey = cache.identifier(field.key);
			fieldDecoders.push(fieldDecoder(cache, key, field.shape));
		}
		for (const field of shape.global) {
			const key = symbolFromKey(cache.identifier<GlobalFieldKey>(field.key));
			fieldDecoders.push(fieldDecoder(cache, key, field.shape));
		}
		this.fieldDecoders = fieldDecoders;
	}
	public decode(decoders: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk {
		const type: TreeSchemaIdentifier = this.type ?? readStreamIdentifier(stream, this.cache);
		// TODO: Consider typechecking against stored schema in here somewhere.

		const value = readValue(stream, this.shape.value);
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

		if (this.shape.extraLocal !== undefined) {
			const decoder = decoders[this.shape.extraLocal];
			const inner = readStreamStream(stream);
			while (inner.offset !== inner.data.length) {
				const key: LocalFieldKey = readStreamIdentifier(inner, this.cache);
				addField(key, decoder.decode(decoders, inner));
			}
		}

		if (this.shape.extraGlobal !== undefined) {
			const decoder = decoders[this.shape.extraGlobal];
			const inner = readStreamStream(stream);
			while (inner.offset !== inner.data.length) {
				const key = symbolFromKey(readStreamIdentifier(inner, this.cache));
				addField(key, decoder.decode(decoders, inner));
			}
		}

		return new BasicChunk(type, fields, value);
	}
}
