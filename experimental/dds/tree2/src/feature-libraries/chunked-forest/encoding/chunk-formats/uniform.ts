/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { TreeChunk } from "../../chunk";
import { ChunkShape, FieldShape, TreeShape, UniformChunk } from "../../uniformChunk";
import {
	BufferFormat,
	DecoderCache,
	EncoderCache,
	NamedChunkEncoder,
	Shape,
	decoderCacheSlot,
	encoderCacheSlot,
} from "../chunkEncodingGeneric";
import {
	Counter,
	DeduplicationTable,
	ChunkDecoder,
	StreamCursor,
	readStream,
	getChecked,
} from "../chunkEncodingUtilities";
import { EncodedChunkShape, EncodedUniformChunkShape } from "../format";
import { fail, getOrCreate, getOrCreateSlot } from "../../../../util";
import { GlobalFieldKey, LocalFieldKey, symbolFromKey } from "../../../../core";

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

export const uniformEncoder: NamedChunkEncoder<EncodedChunkShape, UniformChunk> = {
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

export interface UniformTreeShapeInfo {
	readonly tree: TreeShape;
	readonly chunk: Map<number, ChunkShape>;
}

/**
 * If decodeTreeShape recurses on the same shape due to a recursive structure, it would stack overflow.
 * This should never happen because UniformShapes can't be recursive (or their node count would be infinite).
 * Malformed could cause such a recursive case.
 * To detect such cases with a better error, decodingSet is used to track what calls to decodeTreeShape are running.
 *
 * Note that other kinds of shapes can be recursive.
 * */
const decodingShapeSet: Set<EncodedUniformChunkShape> = new Set();

// private readonly treeShapes: Map<EncodedUniformChunkShape, UniformTreeShapeInfo> = new Map();
// private readonly decoders: Map<EncodedUniformChunkShape, ChunkDecoder> = new Map();

const treeShapesSlot = decoderCacheSlot<Map<EncodedUniformChunkShape, UniformTreeShapeInfo>>();
const decodersSlot = decoderCacheSlot<Map<EncodedUniformChunkShape, ChunkDecoder>>();

function decodeTreeShape(
	cache: DecoderCache<EncodedChunkShape>,
	treeShape: EncodedUniformChunkShape,
): UniformTreeShapeInfo {
	const getInnerShape = (shapeIndex: number) => {
		const innerShape = getChecked(cache.shapes, shapeIndex);
		const innerUniformShape = innerShape.a;
		assert(
			innerUniformShape !== undefined,
			"Uniform field shape must reference a uniform chunk shape",
		);
		return innerUniformShape;
	};

	const treeShapes = getOrCreateSlot(cache.slots, treeShapesSlot, () => new Map());

	return getOrCreate(treeShapes, treeShape, (shape) => {
		assert(
			!decodingShapeSet.has(treeShape),
			"Malformed encoded tree contains recursive uniform chunk shape",
		);
		decodingShapeSet.add(treeShape);
		const fields = shape.local.map((field): FieldShape => {
			const innerShape = getInnerShape(field.shape);
			return [
				cache.identifier<LocalFieldKey>(field.key),
				decodeTreeShape(cache, innerShape).tree,
				field.count,
			];
		});
		for (const field of shape.global) {
			const innerShape = getInnerShape(field.shape);
			fields.push([
				symbolFromKey(cache.identifier<GlobalFieldKey>(field.key)),
				decodeTreeShape(cache, innerShape).tree,
				field.count,
			]);
		}
		decodingShapeSet.delete(treeShape);
		return {
			tree: new TreeShape(cache.identifier(shape.type), shape.hasValue, fields),
			chunk: new Map(),
		};
	});
}

export function decodeUniformChunkShape(
	chunkShape: EncodedUniformChunkShape,
	cache: DecoderCache<EncodedChunkShape>,
): ChunkDecoder {
	const decoders = getOrCreateSlot(cache.slots, decodersSlot, () => new Map());
	return getOrCreate(decoders, chunkShape, (shape) => {
		const treeShape: UniformTreeShapeInfo = decodeTreeShape(cache, shape);
		return new UniformChunkDecoder(treeShape);
	});
}
