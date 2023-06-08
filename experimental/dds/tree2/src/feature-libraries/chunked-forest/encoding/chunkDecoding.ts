/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { BrandedType, assertValidIndex } from "../../../util";
import {
	FieldKey,
	GlobalFieldKey,
	LocalFieldKey,
	TreeSchemaIdentifier,
	symbolFromKey,
} from "../../../core";
import { TreeChunk } from "../chunk";
import { BasicChunk } from "../basicChunk";
import { SequenceChunk } from "../sequenceChunk";
import { EncodedArrayShape, EncodedBasicShape, EncodedChunk, EncodedChunkShape } from "./format";
import {
	ChunkDecoder,
	DiscriminatedUnionDispatcher,
	StreamCursor,
	generalDecoder,
	getChecked,
	readStream,
	readStreamBoolean,
	readStreamNumber,
} from "./chunkEncodingUtilities";
import { DecoderCache, decode as genericDecode } from "./chunkEncodingGeneric";
import { decodeUniformChunkShape } from "./chunk-formats";

export function decode(chunk: EncodedChunk): TreeChunk {
	return genericDecode(decoderLibrary, chunk);
}

const decoderLibrary = new DiscriminatedUnionDispatcher<
	EncodedChunkShape,
	[cache: DecoderCache<EncodedChunkShape>],
	ChunkDecoder
>({
	a: decodeUniformChunkShape,
	b(shape: EncodedBasicShape, cache): ChunkDecoder {
		return new BasicShapeDecoder(shape, cache);
	},
	c(shape: EncodedArrayShape, cache): ChunkDecoder {
		return arrayDecoder;
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

class BasicShapeDecoder implements ChunkDecoder {
	private readonly type: TreeSchemaIdentifier;
	private readonly fieldDecoders: readonly BasicFieldDecoder[];
	public constructor(
		private readonly shape: EncodedBasicShape,
		private readonly cache: DecoderCache<EncodedChunkShape>,
	) {
		this.type = cache.identifier(shape.type);
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
		const hasValue = this.shape.value ?? readStreamBoolean(stream);
		const value = hasValue ? readStream(stream) : undefined;
		const fields: Map<FieldKey, TreeChunk[]> = new Map();

		// Helper to add fields, but with unneeded array chunks removed.
		function addField(key: FieldKey, data: TreeChunk): void {
			// TODO: when handling of ArrayChunks has better performance (for example in cursors),
			// consider keeping array chunks here if they are longer than some threshold.
			if (data instanceof SequenceChunk) {
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

		if (this.shape.extraLocalFields) {
			const count = readStreamNumber(stream);
			for (let index = 0; index < count; index++) {
				const key: LocalFieldKey = readStreamIdentifier(stream, this.cache);
				addField(key, generalDecoder(decoders, stream));
			}
		}

		if (this.shape.extraGlobalFields) {
			const count = readStreamNumber(stream);
			for (let index = 0; index < count; index++) {
				const key = symbolFromKey(readStreamIdentifier(stream, this.cache));
				addField(key, generalDecoder(decoders, stream));
			}
		}

		return new BasicChunk(this.type, fields, value);
	}
}

const arrayDecoder: ChunkDecoder = {
	decode(decoders: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk {
		const items: TreeChunk[] = [];
		const count = readStreamNumber(stream);
		for (let index = 0; index < count; index++) {
			const shapeIndex = readStreamNumber(stream);
			items.push(getChecked(decoders, shapeIndex).decode(decoders, stream));
		}
		return new SequenceChunk(items);
	},
};
