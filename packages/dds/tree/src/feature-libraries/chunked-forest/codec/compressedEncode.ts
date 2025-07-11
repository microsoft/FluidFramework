/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase, fail } from "@fluidframework/core-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";

import {
	CursorLocationType,
	type FieldKey,
	type FieldKindIdentifier,
	type ITreeCursorSynchronous,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type Value,
	forEachNode,
	tryGetChunk,
} from "../../../core/index.js";
import { getOrCreate } from "../../../util/index.js";
import type { FlexFieldKind } from "../../modular-schema/index.js";

import type { Counter, DeduplicationTable } from "./chunkCodecUtilities.js";
import {
	type BufferFormat as BufferFormatGeneric,
	Shape as ShapeGeneric,
	updateShapesAndIdentifiersEncoding,
} from "./chunkEncodingGeneric.js";
import type { FieldBatch } from "./fieldBatch.js";
import {
	type EncodedAnyShape,
	type EncodedChunkShape,
	type EncodedFieldBatch,
	type EncodedNestedArray,
	type EncodedValueShape,
	SpecialField,
	version,
} from "./format.js";
import { ForestEncodedDataBuilder, type EncodedDataBuilder } from "./encodedDataBuilder.js";
import type { ChunkReferenceId, IncrementalEncoder } from "./codecs.js";

/**
 * Encode data from `FieldBatch` into an `EncodedFieldBatch`. If `incrementalEncoder` is provided, fields that
 * support incremental encoding will encode their chunks separately via the `incrementalEncoder`. See
 * {@link IncrementalEncoder} for more details.
 *
 * Optimized for encoded size and encoding performance.
 *
 * Most of the compression strategy comes from the policy provided via `cache`.
 */
export function compressedEncode(
	fieldBatch: FieldBatch,
	cache: EncoderCache,
	incrementalEncoder?: IncrementalEncoder,
): EncodedFieldBatch {
	const batchBuffer: BufferFormat[] = [];

	// Populate buffer, including shape and identifier references
	for (const cursor of fieldBatch) {
		const buffer: BufferFormat = [];
		const forestEncodedDataBuilder = new ForestEncodedDataBuilder(buffer, incrementalEncoder);
		anyFieldEncoder.encodeField(cursor, cache, forestEncodedDataBuilder);
		batchBuffer.push(buffer);
	}
	return updateShapesAndIdentifiersEncoding(version, batchBuffer);
}

export type BufferFormat = BufferFormatGeneric<EncodedChunkShape>;
export type Shape = ShapeGeneric<EncodedChunkShape>;

/**
 * Like {@link FieldEncoder}, except data will be prefixed with the key.
 */
export interface KeyedFieldEncoder {
	readonly key: FieldKey;
	readonly encoder: FieldEncoder;
}

/**
 * An encoder with an associated shape.
 */
export interface Encoder {
	/**
	 * The shape which describes how the encoded data is laid out.
	 * Used by decoders to interpret the output of `encodeNode`.
	 */
	readonly shape: Shape;
}

/**
 * An encoder for a specific shape of node.
 *
 * Can only be used with compatible nodes.
 */
export interface NodeEncoder extends Encoder {
	/**
	 * @param cursor - in Nodes mode. Does not move cursor.
	 */
	encodeNode(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		dataBuilder: EncodedDataBuilder,
	): void;
}

/**
 * Like {@link NodeEncoder}, except encodes a run of nodes.
 */
export interface NodesEncoder extends Encoder {
	/**
	 * @param cursor - in Nodes mode. Moves cursor however many nodes it encodes.
	 */
	encodeNodes(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		dataBuilder: EncodedDataBuilder,
	): void;
}

/**
 * Like {@link NodeEncoder}, except encodes a field.
 */
export interface FieldEncoder extends Encoder {
	/**
	 * @param cursor - in Fields mode. Encodes entire field.
	 */
	encodeField(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		dataBuilder: EncodedDataBuilder,
	): void;
}

/**
 * Makes a {@link FieldEncoder} which runs `encoder` on every node in the field.
 * This does not encode the number nodes: the user of this may need to encode that elsewhere.
 */
export function asFieldEncoder(encoder: NodeEncoder): FieldEncoder {
	return {
		encodeField(
			cursor: ITreeCursorSynchronous,
			shapes: EncoderCache,
			dataBuilder: EncodedDataBuilder,
		): void {
			forEachNode(cursor, () => encoder.encodeNode(cursor, shapes, dataBuilder));
		},
		shape: encoder.shape,
	};
}

/**
 * Adapt a {@link NodeEncoder} to a {@link NodesEncoder} which invokes `encoder` once.
 */
export function asNodesEncoder(encoder: NodeEncoder): NodesEncoder {
	return {
		encodeNodes(
			cursor: ITreeCursorSynchronous,
			shapes: EncoderCache,
			dataBuilder: EncodedDataBuilder,
		): void {
			encoder.encodeNode(cursor, shapes, dataBuilder);
			cursor.nextNode();
		},
		shape: encoder.shape,
	};
}

/**
 * Encodes a chunk with {@link EncodedAnyShape} by prefixing the data with its shape.
 */
export class AnyShape extends ShapeGeneric<EncodedChunkShape> {
	private constructor() {
		super();
	}
	public static readonly instance = new AnyShape();

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape>,
	): EncodedChunkShape {
		const encodedAnyShape: EncodedAnyShape = 0;
		return { d: encodedAnyShape };
	}

	public countReferencedShapesAndIdentifiers(
		identifiers: Counter<string>,
		shapeDiscovered: (shape: Shape) => void,
	): void {}

	public static encodeField(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		dataBuilder: EncodedDataBuilder,
		shape: FieldEncoder,
	): void {
		dataBuilder.addToBuffer(shape.shape);
		shape.encodeField(cursor, cache, dataBuilder);
	}

	public static encodeNode(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		dataBuilder: EncodedDataBuilder,
		shape: NodeEncoder,
	): void {
		dataBuilder.addToBuffer(shape.shape);
		shape.encodeNode(cursor, cache, dataBuilder);
	}

	public static encodeNodes(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		dataBuilder: EncodedDataBuilder,
		shape: NodesEncoder,
	): void {
		dataBuilder.addToBuffer(shape.shape);
		shape.encodeNodes(cursor, cache, dataBuilder);
	}
}

/**
 * Encodes a single node polymorphically.
 */
export const anyNodeEncoder: NodeEncoder = {
	encodeNode(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		dataBuilder: EncodedDataBuilder,
	): void {
		// TODO: Fast path uniform chunk content.
		const shape = cache.shapeFromTree(cursor.type);
		AnyShape.encodeNode(cursor, cache, dataBuilder, shape);
	},

	shape: AnyShape.instance,
};

/**
 * Encodes a field polymorphically.
 */
export const anyFieldEncoder: FieldEncoder = {
	encodeField(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		dataBuilder: EncodedDataBuilder,
	): void {
		// TODO: Fast path uniform chunks.

		if (cursor.getFieldLength() === 0) {
			const shape = InlineArrayShape.empty;
			AnyShape.encodeField(cursor, cache, dataBuilder, shape);
		} else if (cursor.getFieldLength() === 1) {
			// Fast path chunk of size one size one at least: skip nested array.
			cursor.enterNode(0);
			anyNodeEncoder.encodeNode(cursor, cache, dataBuilder);
			cursor.exitNode();
		} else {
			// TODO: more efficient encoding for common cases.
			// Could try to find more specific shape compatible with all children than `anyNodeEncoder`.

			const shape = cache.nestedArray(anyNodeEncoder);
			AnyShape.encodeField(cursor, cache, dataBuilder, shape);
		}
	},

	shape: AnyShape.instance,
};

/**
 * Encodes a chunk using {@link EncodedInlineArray}.
 */
export class InlineArrayShape
	extends ShapeGeneric<EncodedChunkShape>
	implements NodesEncoder, FieldEncoder
{
	public static readonly empty: InlineArrayShape = new InlineArrayShape(0, {
		get shape() {
			// Not actually used, makes count work without adding an additional shape.
			return InlineArrayShape.empty;
		},
		encodeNodes(
			cursor: ITreeCursorSynchronous,
			shapes: EncoderCache,
			dataBuilder: EncodedDataBuilder,
		): void {
			fail(0xb4d /* Empty array should not encode any nodes */);
		},
	});

	/**
	 * @param length - number of invocations of `inner`.
	 */
	public constructor(
		public readonly length: number,
		public readonly inner: NodesEncoder,
	) {
		super();
	}

	public encodeNodes(
		cursor: ITreeCursorSynchronous,
		shapes: EncoderCache,
		dataBuilder: EncodedDataBuilder,
	): void {
		// Linter is wrong about this loop being for-of compatible.
		// eslint-disable-next-line @typescript-eslint/prefer-for-of
		for (let index = 0; index < this.length; index++) {
			this.inner.encodeNodes(cursor, shapes, dataBuilder);
		}
	}

	public encodeField(
		cursor: ITreeCursorSynchronous,
		shapes: EncoderCache,
		dataBuilder: EncodedDataBuilder,
	): void {
		// Its possible individual items from this array encode multiple nodes, so don't assume === here.
		assert(
			cursor.getFieldLength() >= this.length,
			0x73c /* unexpected length for fixed length array */,
		);
		cursor.firstNode();
		this.encodeNodes(cursor, shapes, dataBuilder);
		assert(
			cursor.mode === CursorLocationType.Fields,
			0x73d /* should return to fields mode when finished encoding */,
		);
	}

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape>,
	): EncodedChunkShape {
		return {
			b: {
				length: this.length,
				shape: shapes.valueToIndex.get(this.inner.shape) ?? fail(0xb4e /* missing shape */),
			},
		};
	}

	public countReferencedShapesAndIdentifiers(
		identifiers: Counter<string>,
		shapeDiscovered: (shape: Shape) => void,
	): void {
		shapeDiscovered(this.inner.shape);
	}

	public get shape(): this {
		return this;
	}
}

/**
 * Encodes a field as a nested array with the {@link EncodedNestedArray} shape.
 */
export class NestedArrayShape extends ShapeGeneric<EncodedChunkShape> implements FieldEncoder {
	public readonly shape: Shape;

	public constructor(public readonly inner: NodeEncoder) {
		super();
		this.shape = this;
	}

	public encodeField(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		dataBuilder: EncodedDataBuilder,
	): void {
		const buffer: BufferFormat = [];
		const nodesDataBuilder = dataBuilder.createFromBuffer(buffer);
		let allNonZeroSize = true;
		const length = cursor.getFieldLength();
		forEachNode(cursor, () => {
			const before = buffer.length;
			this.inner.encodeNode(cursor, cache, nodesDataBuilder);
			allNonZeroSize &&= buffer.length - before !== 0;
		});
		if (buffer.length === 0) {
			// This relies on the number of inner chunks being the same as the number of nodes.
			// If making inner a `NodesEncoder`, this code will have to be adjusted accordingly.
			dataBuilder.addToBuffer(length);
		} else {
			assert(
				allNonZeroSize,
				0x73e /* either all or none of the members of a nested array must be 0 sized, or there is no way the decoder could process the content correctly. */,
			);
			dataBuilder.addToBuffer(buffer);
		}
	}

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape>,
	): EncodedChunkShape {
		const shape: EncodedNestedArray =
			shapes.valueToIndex.get(this.inner.shape) ??
			fail(0xb4f /* index for shape not found in table */);
		return {
			a: shape,
		};
	}

	public countReferencedShapesAndIdentifiers(
		identifiers: Counter<string>,
		shapeDiscovered: (shape: Shape) => void,
	): void {
		shapeDiscovered(this.inner.shape);
	}
}

/**
 * Encodes a field that supports incremental encoding. All the chunks in this field will be encoded separately via
 * an `EncodedDataBuilder`. The encoded data for this field will be an array of {@link ChunkReferenceId}s, one for
 * each of its chunks.
 */
export class IncrementalFieldShape
	extends ShapeGeneric<EncodedChunkShape>
	implements FieldEncoder
{
	public constructor() {
		super();
	}

	public encodeField(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		dataBuilder: EncodedDataBuilder,
	): void {
		assert(
			dataBuilder.shouldEncodeIncrementally,
			"incremental encoding must be enabled to use IncrementalFieldShape",
		);

		// Encodes all the nodes in the chunk at the cursor position using `InlineArrayShape`.
		const encodeChunkNodes = (
			chunkCursor: ITreeCursorSynchronous,
			chunkDataBuilder: EncodedDataBuilder,
		): void => {
			const inlineArrayShape = new InlineArrayShape(
				chunkCursor.chunkLength,
				asNodesEncoder(anyNodeEncoder),
			);
			inlineArrayShape.encodeNodes(cursor, cache, chunkDataBuilder);
		};

		const chunkReferenceIds: ChunkReferenceId[] = [];
		let inNodes = cursor.firstNode();
		while (inNodes && cursor.chunkLength !== 0) {
			const chunk = tryGetChunk(cursor);
			if (chunk === undefined) {
				continue;
			}

			let chunkEncoded = false;
			const chunkSummaryRefId = dataBuilder.encodeIncrementalChunk(
				chunk,
				(chunkDataBuilder) => {
					encodeChunkNodes(cursor, chunkDataBuilder);
					chunk.referenceAdded();
					chunkEncoded = true;
				},
			);

			chunkReferenceIds.push(chunkSummaryRefId);

			if (chunkEncoded) {
				// If the chunk was encoded, the cursor will have moved to the next chunk, if any. If there were no
				// more chunks, the cursor will have moved to the beginning of the field and will be in `Fields` mode.
				if (cursor.mode === CursorLocationType.Fields) {
					inNodes = false;
				}
			} else {
				// If the chunk was not encoded, move the cursor to the next chunk.
				inNodes = cursor.seekNodes(cursor.chunkLength);
			}
		}
		dataBuilder.addToBuffer(chunkReferenceIds);
	}

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape>,
	): EncodedChunkShape {
		return {
			e: 0 /* EncodedIncrementalShape */,
		};
	}

	public countReferencedShapesAndIdentifiers(
		identifiers: Counter<string>,
		shapeDiscovered: (shape: Shape) => void,
	): void {}

	public get shape(): this {
		return this;
	}
}

/**
 * Encode `value` with `shape` into `outputBuffer`.
 *
 * Requires that `value` is compatible with `shape`.
 */
export function encodeValue(
	value: Value,
	shape: EncodedValueShape,
	dataBuilder: EncodedDataBuilder,
): void {
	if (shape === undefined) {
		if (value !== undefined) {
			dataBuilder.addToBuffer(true);
			dataBuilder.addToBuffer(value);
		} else {
			dataBuilder.addToBuffer(false);
		}
	} else {
		if (shape === true) {
			assert(value !== undefined, 0x78d /* required value must not be missing */);
			dataBuilder.addToBuffer(value);
		} else if (shape === false) {
			assert(value === undefined, 0x73f /* incompatible value shape: expected no value */);
		} else if (Array.isArray(shape)) {
			assert(shape.length === 1, 0x740 /* expected a single constant for value */);
		} else if (shape === SpecialField.Identifier) {
			// This case is a special case handling the encoding of identifier fields.
			assert(value !== undefined, 0x998 /* required value must not be missing */);
			dataBuilder.addToBuffer(value);
		} else {
			// EncodedCounter case:
			unreachableCase(shape, "Encoding values as deltas is not yet supported");
		}
	}
}

export class EncoderCache implements TreeShaper, FieldShaper {
	private readonly shapesFromSchema: Map<TreeNodeSchemaIdentifier, NodeEncoder> = new Map();
	private readonly nestedArrays: Map<NodeEncoder, NestedArrayShape> = new Map();
	public constructor(
		private readonly treeEncoder: TreeShapePolicy,
		private readonly fieldEncoder: FieldShapePolicy,
		public readonly fieldShapes: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
		public readonly idCompressor: IIdCompressor,
	) {}

	public shapeFromTree(schemaName: TreeNodeSchemaIdentifier): NodeEncoder {
		return getOrCreate(this.shapesFromSchema, schemaName, () =>
			this.treeEncoder(this, schemaName),
		);
	}

	public nestedArray(inner: NodeEncoder): NestedArrayShape {
		return getOrCreate(this.nestedArrays, inner, () => new NestedArrayShape(inner));
	}

	public shapeFromField(field: TreeFieldStoredSchema): FieldEncoder {
		return new LazyFieldEncoder(this, field, this.fieldEncoder);
	}
}

export interface TreeShaper {
	shapeFromTree(schemaName: TreeNodeSchemaIdentifier): NodeEncoder;
}

export interface FieldShaper {
	shapeFromField(field: TreeFieldStoredSchema): FieldEncoder;
}

export type FieldShapePolicy = (
	treeShaper: TreeShaper,
	field: TreeFieldStoredSchema,
) => FieldEncoder;

export type TreeShapePolicy = (
	fieldShaper: FieldShaper,
	schemaName: TreeNodeSchemaIdentifier,
) => NodeEncoder;

class LazyFieldEncoder implements FieldEncoder {
	private encoderLazy: FieldEncoder | undefined;

	public constructor(
		public readonly cache: TreeShaper,
		public readonly field: TreeFieldStoredSchema,
		private readonly fieldEncoder: FieldShapePolicy,
	) {}
	public encodeField(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		dataBuilder: EncodedDataBuilder,
	): void {
		this.encoder.encodeField(cursor, cache, dataBuilder);
	}

	private get encoder(): FieldEncoder {
		if (this.encoderLazy === undefined) {
			this.encoderLazy = this.fieldEncoder(this.cache, this.field);
		}
		return this.encoderLazy;
	}

	public get shape(): Shape {
		return this.encoder.shape;
	}
}
