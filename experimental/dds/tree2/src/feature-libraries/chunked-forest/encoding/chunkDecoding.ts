/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { BrandedType, assertValidIndex } from "../../../util";
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
	generalDecoder,
	getChecked,
	readStream,
	readStreamBoolean,
	readStreamNumber,
	readStreamStream,
} from "./chunkEncodingUtilities";
import { DecoderCache, decode as genericDecode } from "./chunkEncodingGeneric";

export function decode(chunk: EncodedChunk): TreeChunk {
	return genericDecode(decoderLibrary, chunk);
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
		return AnyDecoder.instance;
	},
});

type BasicFieldDecoder = (
	decoders: readonly ChunkDecoder[],
	stream: StreamCursor,
) => [FieldKey, TreeChunk];

function fieldDecoder(
	cache: DecoderCache<EncodedChunkShape>,
	key: FieldKey,
	shape: number | undefined,
): BasicFieldDecoder {
	if (shape !== undefined) {
		assertValidIndex(shape, cache.shapes);
		return (decoders, stream) => [key, decoders[shape].decode(decoders, stream)];
	} else {
		return (decoders, stream) => {
			return [key, generalDecoder(decoders, stream)];
		};
	}
}

export function readStreamIdentifier<T extends string & BrandedType<string, string>>(
	stream: StreamCursor,
	cache: DecoderCache<EncodedChunkShape>,
): T {
	const content = readStream(stream);
	assert(
		typeof content === "number" || typeof content === "string",
		"content to be a number or string",
	);
	return cache.identifier(content);
}

function readValue(stream: StreamCursor, shape: EncodedValueShape): Value {
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

class TreeDecoder implements ChunkDecoder {
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
			if (data instanceof SequenceChunk) {
				if (data.subChunks.length === 0) {
					return;
				}
				for (const sub of data.subChunks) {
					sub.referenceAdded();
				}
				fields.set(key, data.subChunks);
				data.referenceRemoved();
			} else {
				fields.set(key, [data]);
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

class NestedArrayDecoder implements ChunkDecoder {
	public constructor(private readonly shape: EncodedNestedArray) {}
	public decode(decoders: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk {
		const decoder = decoders[this.shape];
		const inner = readStreamStream(stream);
		// TODO: uniform chunk fast path
		const chunks: TreeChunk[] = [];
		while (inner.offset !== inner.data.length) {
			// TODO: maybe remove unneeded sequence chunks here?
			chunks.push(decoder.decode(decoders, inner));
		}
		// TODO: maybe remove unneeded sequence chunks here?
		return new SequenceChunk(chunks);
	}
}

class InlineArrayDecoder implements ChunkDecoder {
	public constructor(private readonly shape: EncodedInlineArray) {}
	public decode(decoders: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk {
		const length = this.shape.length;
		const decoder = decoders[this.shape.shape];
		const chunks: TreeChunk[] = [];
		for (let index = 0; index < length; index++) {
			// TODO: maybe remove unneeded sequence chunks here?
			chunks.push(decoder.decode(decoders, stream));
		}

		// TODO: maybe remove unneeded sequence chunks here?
		return new SequenceChunk(chunks);
	}
}

class AnyDecoder implements ChunkDecoder {
	public static readonly instance = new AnyDecoder();
	private constructor() {}
	public decode(decoders: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk {
		const shapeIndex = readStreamNumber(stream);
		const decoder = getChecked(decoders, shapeIndex);
		return decoder.decode(decoders, stream);
	}
}
