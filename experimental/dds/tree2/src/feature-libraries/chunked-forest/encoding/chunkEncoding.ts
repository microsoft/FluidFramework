/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { BrandedType, assertValidIndex, fail, getOrCreate } from "../../../util";
import {
	FieldKey,
	GlobalFieldKey,
	GlobalFieldKeySymbol,
	LocalFieldKey,
	TreeSchemaIdentifier,
	symbolFromKey,
} from "../../../core";
import { TreeChunk } from "../chunk";
import { BasicChunk } from "../basicChunk";
import { SequenceChunk } from "../sequenceChunk";
import { ChunkShape, FieldShape, TreeShape, UniformChunk } from "../uniformChunk";
import {
	EncodedArrayShape,
	EncodedBasicShape,
	EncodedChunk,
	EncodedChunkShape,
	EncodedUniformShape,
	EncodedUniformTreeShape,
	version,
} from "./format";
import {
	ChunkDecoder,
	Counter,
	DeduplicationTable,
	DiscriminatedUnionDispatcher,
	StreamCursor,
	getChecked,
	readStream,
	readStreamNumber,
} from "./chunkEncodingUtilities";
import {
	BufferFormat,
	ChunkEncoderLibrary,
	NamedChunkEncoder,
	encode as encodeGeneric,
	decode as genericDecode,
	Shape as ShapeGeneric,
} from "./chunkEncodingGeneric";

export function encode(chunk: TreeChunk): EncodedChunk {
	return encodeGeneric(version, encoderLibrary, new ShapeManager(), chunk);
}

type Shape = ShapeGeneric<EncodedChunkShape>;

export function decode(chunk: EncodedChunk): TreeChunk {
	const cache = new DecoderSharedCache(chunk.identifiers, chunk.shapes);
	return genericDecode(decoderLibrary, cache, chunk);
}

const decoderLibrary = new DiscriminatedUnionDispatcher<
	EncodedChunkShape,
	[cache: DecoderSharedCache],
	ChunkDecoder
>({
	a(shape: EncodedUniformShape, cache): ChunkDecoder {
		return cache.decodeUniformChunkShape(shape);
	},
	b(shape: EncodedBasicShape, cache): ChunkDecoder {
		return new BasicShapeDecoder(shape, cache);
	},
	c(shape: EncodedArrayShape, cache): ChunkDecoder {
		return basicArrayDecoder;
	},
});

/**
 * Caches shared data for use in constructing decoders.
 */
class DecoderSharedCache {
	/**
	 *
	 * @param identifiers - identifier substitution table (use to replace numeric identifier indexes with the actual identifiers from this table).
	 *
	 * Unlike the other data stored in this object, identifiers and shapes are not really a cache since the decoders don't any any other way to access this information.
	 */
	public constructor(
		public readonly identifiers: readonly string[],
		public readonly shapes: readonly EncodedChunkShape[],
	) {}

	private readonly treeShapes: Map<EncodedUniformTreeShape, TreeShape> = new Map();
	private readonly decoders: Map<EncodedUniformShape, ChunkDecoder> = new Map();

	public identifier<T extends string & BrandedType<string, string>>(encoded: string | number): T {
		if (typeof encoded === "string") {
			return encoded as T;
		}
		return getChecked(this.identifiers, encoded) as T;
	}

	/**
	 * If decodeTreeShape recurses on the same shape due to a recursive structure, it would stack overflow.
	 * This should never happen because UniformShapes can't be recursive (or their node count would be infinite).
	 * Malformed could cause such a recursive case.
	 * To detect such cases with a better error, decodingSet is used to track what calls to decodeTreeShape are running.
	 *
	 * Note that other kinds of shapes can be recursive.
	 * */
	private readonly decodingShapeSet: Set<EncodedUniformTreeShape> = new Set();

	private decodeTreeShape(treeShape: EncodedUniformTreeShape): TreeShape {
		const getInnerShape = (shapeIndex: number) => {
			const innerShape = getChecked(this.shapes, shapeIndex);
			const innerUniformShape = innerShape.a;
			assert(
				innerUniformShape !== undefined,
				"Uniform field shape must reference a uniform chunk shape",
			);
			return innerUniformShape;
		};

		return getOrCreate(this.treeShapes, treeShape, (shape) => {
			assert(
				!this.decodingShapeSet.has(treeShape),
				"Malformed encoded tree contains recursive uniform chunk shape",
			);
			this.decodingShapeSet.add(treeShape);
			const fields = shape.local.map((field): FieldShape => {
				const innerShape = getInnerShape(field.shape);
				return [
					this.identifier<LocalFieldKey>(field.key),
					this.decodeTreeShape(innerShape.treeShape),
					innerShape.topLevelLength,
				];
			});
			for (const field of shape.global) {
				const innerShape = getInnerShape(field.shape);
				fields.push([
					symbolFromKey(this.identifier<GlobalFieldKey>(field.key)),
					this.decodeTreeShape(innerShape.treeShape),
					innerShape.topLevelLength,
				]);
			}
			this.decodingShapeSet.delete(treeShape);
			return new TreeShape(this.identifier(shape.type), shape.hasValue, fields);
		});
	}

	public decodeUniformChunkShape(chunkShape: EncodedUniformShape): ChunkDecoder {
		return getOrCreate(this.decoders, chunkShape, (shape) => {
			const treeShape: TreeShape = this.decodeTreeShape(shape.treeShape);
			return new UniformChunkDecoder(new ChunkShape(treeShape, shape.topLevelLength));
		});
	}
}

const sequenceEncoder: NamedChunkEncoder<ShapeManager, EncodedChunkShape, SequenceChunk> = {
	type: SequenceChunk,
	encode(
		chunk: SequenceChunk,
		shapes: ShapeManager,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void {
		fail("TODO");
	},
};

const basicEncoder: NamedChunkEncoder<ShapeManager, EncodedChunkShape, BasicChunk> = {
	type: BasicChunk,
	encode(
		chunk: BasicChunk,
		shapes: ShapeManager,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void {
		fail("TODO");
	},
};

/**
 * Builds shapes with deduplication.
 */
class ShapeManager {
	private readonly map: Map<TreeSchemaIdentifier, TreeShapeManager> = new Map();
	private readonly chunkShapes: Map<ChunkShape, Shape> = new Map();

	public chunkShape(chunk: ChunkShape): Shape {
		return getOrCreate(this.chunkShapes, chunk, (chunkShape): Shape => {
			return new UniformShape(chunkShape);
		});
	}
}

interface TreeShapeManager {}

class UniformShape extends ShapeGeneric<EncodedChunkShape> {
	public constructor(private readonly chunkShape: ChunkShape) {
		super();
	}

	public count(identifiers: Counter<string>, shapes: (shape: Shape) => void): void {
		// TODO
	}

	public encode(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape>,
	): EncodedChunkShape {
		fail("todo");
	}
}

const uniformEncoder: NamedChunkEncoder<ShapeManager, EncodedChunkShape, UniformChunk> = {
	type: UniformChunk,
	encode(
		chunk: UniformChunk,
		shapes: ShapeManager,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void {
		outputBuffer.push(shapes.chunkShape(chunk.shape));
		outputBuffer.push(chunk.values);
	},
};

class UniformChunkDecoder implements ChunkDecoder {
	public constructor(private readonly shape: ChunkShape) {}
	public decode(decoders: ChunkDecoder[], stream: StreamCursor): TreeChunk {
		const content = readStream(stream);
		// This assert could be using an encoding schema and schema validation for consistency, but its likely not worth it.
		assert(Array.isArray(content), "expected array for uniform chunk content");
		// The content of `content` could by checked against a tree schema here, but for not its just trusted.
		return new UniformChunk(this.shape, content);
	}
}

type BasicFieldDecoder = (
	decoders: readonly ChunkDecoder[],
	stream: StreamCursor,
) => [FieldKey, TreeChunk];

function fieldDecoder(
	cache: DecoderSharedCache,
	key: FieldKey,
	shape: number | undefined,
): BasicFieldDecoder {
	if (shape !== undefined) {
		assertValidIndex(shape, cache.shapes);
		return (decoders, stream) => [key, decoders[shape].decode(decoders, stream)];
	} else {
		return (decoders, stream) => {
			const shapeIndex = readStreamNumber(stream);
			return [key, getChecked(decoders, shapeIndex).decode(decoders, stream)];
		};
	}
}

export function readStreamIdentifier<T extends string & BrandedType<string, string>>(
	stream: StreamCursor,
	cache: DecoderSharedCache,
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
		private readonly cache: DecoderSharedCache,
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
		const value = this.shape.value ? readStream(stream) : undefined;
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
				const shapeIndex = readStreamNumber(stream);
				addField(key, getChecked(decoders, shapeIndex).decode(decoders, stream));
			}
		}

		if (this.shape.extraGlobalFields) {
			const count = readStreamNumber(stream);
			for (let index = 0; index < count; index++) {
				const key: GlobalFieldKeySymbol = symbolFromKey(
					readStreamIdentifier(stream, this.cache),
				);
				const shapeIndex = readStreamNumber(stream);
				addField(key, getChecked(decoders, shapeIndex).decode(decoders, stream));
			}
		}

		return new BasicChunk(this.type, fields, value);
	}
}

const basicArrayDecoder: ChunkDecoder = {
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

const encoderLibrary = new ChunkEncoderLibrary<ShapeManager, EncodedChunkShape>(
	sequenceEncoder,
	basicEncoder,
	uniformEncoder,
);
