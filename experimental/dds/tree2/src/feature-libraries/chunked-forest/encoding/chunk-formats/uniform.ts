/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { TreeChunk } from "../../chunk";
import { ChunkShape, UniformChunk } from "../../uniformChunk";
import {
	BufferFormat,
	EncoderCache,
	NamedChunkEncoder,
	Shape,
	encoderCacheSlot,
} from "../chunkEncodingGeneric";
import {
	Counter,
	DeduplicationTable,
	ChunkDecoder,
	StreamCursor,
	readStream,
} from "../chunkEncodingUtilities";
import { EncodedChunkShape } from "../format";
import { fail, getOrCreate, getOrCreateSlot } from "../../../../util";
import type { UniformTreeShapeInfo } from "../chunkDecoding";

const uniformSlot = encoderCacheSlot<Map<ChunkShape, Shape<EncodedChunkShape>>>();

function cachedChunkShape(cache: EncoderCache, chunk: ChunkShape): Shape<EncodedChunkShape> {
	const slot = getOrCreateSlot(cache, uniformSlot, () => new Map());
	return getOrCreate(slot, chunk, (shape): Shape<EncodedChunkShape> => new UniformShape(shape));
}

export class UniformChunkDecoder implements ChunkDecoder {
	public constructor(private readonly shape: UniformTreeShapeInfo) {}
	public decode(decoders: ChunkDecoder[], stream: StreamCursor): TreeChunk {
		const content = readStream(stream);
		// This assert could be using an encoding schema and schema validation for consistency, but its likely not worth it.
		assert(Array.isArray(content), "expected array for uniform chunk content");
		// The content of `content` could by checked against a tree schema here, but for now its just trusted.
		const shape = getOrCreate(this.shape.chunk, content.length, (numberOfValues) => {
			const topLevelLength = numberOfValues / this.shape.tree.valuesPerTopLevelNode;
			assert(Number.isInteger(topLevelLength), "uniform chunk should be valid length");
			return new ChunkShape(this.shape.tree, topLevelLength);
		});
		return new UniformChunk(shape, content);
	}
}

export class UniformShape extends Shape<EncodedChunkShape> {
	public constructor(private readonly chunkShape: ChunkShape) {
		super();
	}

	public count(
		identifiers: Counter<string>,
		shapes: (shape: Shape<EncodedChunkShape>) => void,
	): void {
		// TODO
	}

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
	): EncodedChunkShape {
		fail("todo");
	}
}

export const uniformEncoder: NamedChunkEncoder<EncoderCache, EncodedChunkShape, UniformChunk> = {
	type: UniformChunk,
	encode(
		chunk: UniformChunk,
		shapes: EncoderCache,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void {
		outputBuffer.push(cachedChunkShape(shapes, chunk.shape));
		outputBuffer.push(chunk.values);
	},
};
