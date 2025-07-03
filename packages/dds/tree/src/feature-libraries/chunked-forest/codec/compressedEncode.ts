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
	type EncodedFieldBatchFormat,
	type EncodedIncrementalShape,
	type EncodedNestedArray,
	type EncodedValueShape,
	FieldUnchanged,
	SpecialField,
	version,
} from "./format.js";
import { EncodedDataBuilder, type IEncodedDataBuilder } from "./encodedDataBuilder.js";
import type { IncrementalEncodingParameters } from "./codecs.js";

/**
 * Encode data from `FieldBatch` into an `EncodedFieldBatch`. Fields that support incremental encoding
 * are encoded into a separate map that is passed in. This can be used to support features like incremental
 * summarization where the summary from these fields can be re-used if unchanged between summaries.
 * Note that each of the incremental field is fully self-describing (contain its own shapes list and identifier
 * table) and not rely on context from its parent
 *
 * Optimized for encoded size and encoding performance.
 *
 * Most of the compression strategy comes from the policy provided via `cache`.
 */
export function compressedEncode(
	fieldBatch: FieldBatch,
	cache: EncoderCache,
	incrementalEncodingParams?: IncrementalEncodingParameters,
): EncodedFieldBatch {
	const encodeIncrementally = incrementalEncodingParams !== undefined;
	const batchBuffer: BufferFormat[] = [];
	const incrementalFieldBuffers: Map<string, FieldBufferFormat> = new Map();

	// Populate buffer, including shape and identifier references
	for (const cursor of fieldBatch) {
		const encodedDataBuilder = new EncodedDataBuilder(
			encodeIncrementally,
			incrementalEncodingParams?.fullTree ?? true,
			[],
			incrementalFieldBuffers,
		);
		anyFieldEncoder.encodeField(cursor, cache, encodedDataBuilder);
		batchBuffer.push(encodedDataBuilder.getBufferIncremental().mainBuffer);
	}

	const recursiveUpdateShapesAndIdentifiersEncoding = (
		incrementalBuffer: BufferFormatIncremental,
		incrementalFieldsBatch: Map<string, EncodedFieldBatchFormat>,
	): EncodedFieldBatch => {
		const encodedFieldBatch = updateShapesAndIdentifiersEncoding(
			version,
			incrementalBuffer.mainBuffer,
		);
		if (incrementalBuffer.incrementalFieldBuffers !== undefined) {
			incrementalBuffer.incrementalFieldBuffers.forEach((fieldBufferFormat, summaryRefId) => {
				if (fieldBufferFormat === FieldUnchanged) {
					incrementalFieldsBatch.set(summaryRefId, fieldBufferFormat);
				} else {
					const innerFieldBufferFormats: Map<string, EncodedFieldBatchFormat> = new Map();
					const innerEncodedFieldBatch = recursiveUpdateShapesAndIdentifiersEncoding(
						fieldBufferFormat,
						innerFieldBufferFormats,
					);
					incrementalFieldsBatch.set(summaryRefId, {
						fieldBatch: innerEncodedFieldBatch,
						incrementalFieldsBatch: innerFieldBufferFormats,
					});
				}
			});
		}
		return encodedFieldBatch;
	};

	return recursiveUpdateShapesAndIdentifiersEncoding(
		{ mainBuffer: batchBuffer, incrementalFieldBuffers },
		encodeIncrementally ? incrementalEncodingParams.outputIncrementalFieldsBatch : new Map(),
	);
}

export type Shape = ShapeGeneric<EncodedChunkShape>;

/**
 * Format for data emitted during encoding, before dictionary compression of identifiers. The data is
 * in a hierarchical format, where values for nested fields like arrays and objects are stored in another
 * buffer and values for other elements are stored directly.
 * For fields that support incremental encoding, the data is a unique compressed id which corresponds to
 * its data in a separate buffer.
 */
export type BufferFormat = BufferFormatGeneric<EncodedChunkShape>;

/**
 * Format for data emitted during encoding where fields that support incremental encoding are added to
 * a separate map. It consists of a main buffer and a map for each of its fields that can be incrementally encoded.
 * Each of the incremental fields is fully self-describing (contain its own shapes list and identifier table) and
 * not rely on context from its parent.
 *
 * @remarks This is currently used during summarization to store the data for fields that support incremental encoding
 * in separate summary trees / blobs such that they can be incrementally summarized.
 */
export interface BufferFormatIncremental {
	readonly mainBuffer: BufferFormat;
	readonly incrementalFieldBuffers: Map<string, FieldBufferFormat> | undefined;
}

/**
 * Format for data of a field that supports incremental encoding. The field may have unchanged since the last summary,
 * in which case its value is FieldUnchanged. Otherwise, its data is a buffer containing its the encoded data.
 */
export type FieldBufferFormat = BufferFormatIncremental | FieldUnchanged;

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
		dataBuilder: IEncodedDataBuilder,
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
		dataBuilder: IEncodedDataBuilder,
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
		dataBuilder: IEncodedDataBuilder,
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
			dataBuilder: IEncodedDataBuilder,
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
			dataBuilder: IEncodedDataBuilder,
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
		dataBuilder: IEncodedDataBuilder,
		shape: FieldEncoder,
	): void {
		dataBuilder.addToBuffer(shape.shape);
		shape.encodeField(cursor, cache, dataBuilder);
	}

	public static encodeNode(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		dataBuilder: IEncodedDataBuilder,
		shape: NodeEncoder,
	): void {
		dataBuilder.addToBuffer(shape.shape);
		shape.encodeNode(cursor, cache, dataBuilder);
	}

	public static encodeNodes(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		dataBuilder: IEncodedDataBuilder,
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
		dataBuilder: IEncodedDataBuilder,
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
		dataBuilder: IEncodedDataBuilder,
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
			dataBuilder: IEncodedDataBuilder,
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
		dataBuilder: IEncodedDataBuilder,
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
		dataBuilder: IEncodedDataBuilder,
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
		dataBuilder: IEncodedDataBuilder,
	): void {
		const buffer: BufferFormat = [];
		const fieldDataBuilder = dataBuilder.createSiblingFromBuffer(buffer);
		let allNonZeroSize = true;
		const length = cursor.getFieldLength();
		forEachNode(cursor, () => {
			const before = buffer.length;
			// TODO: Does this need its own incremental field buffers?
			this.inner.encodeNode(cursor, cache, fieldDataBuilder);
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

export class IncrementalFieldShape
	extends ShapeGeneric<EncodedChunkShape>
	implements FieldEncoder
{
	public constructor() {
		super();
	}

	// private forEachNod2<TCursor extends ITreeCursor = ITreeCursor>(
	// 	cursor: TCursor,
	// 	f: (cursor: TCursor) => void,
	// ): void {
	// 	assert(cursor.mode === CursorLocationType.Fields, 0x3bd /* should be in fields */);
	// 	for (
	// 		let inNodes = cursor.firstNode();
	// 		inNodes;
	// 		inNodes = cursor.seekNodes(cursor.chunkLength)
	// 	) {
	// 		f(cursor);
	// 	}
	// }

	public encodeField(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		dataBuilder: IEncodedDataBuilder,
	): void {
		assert(
			dataBuilder.encodeIncrementally,
			"incremental encoding must be enabled to use IncrementalFieldShape",
		);

		// If there are no nodes in the field, there is no need to do incremental encoding. Encode a zero length field.
		if (cursor.getFieldLength() === 0) {
			dataBuilder.addToBuffer(0);
			return;
		}

		// Find whether the field has changed since the last encoding. If the field changed, the chunks for at least
		// one of the nodes in the field will have summaryRefId undefined due to copy-on-write semantics.
		// Otherwise, all nodes in the field should have the same summaryRefId from the previous encoding.
		let fieldChanged: boolean = false;
		let summaryRefId: string | undefined;
		for (
			let inNodes = cursor.firstNode();
			inNodes;
			inNodes = cursor.seekNodes(cursor.chunkLength)
		) {
			const chunk = tryGetChunk(cursor);
			if (chunk === undefined) {
				continue;
			}
			if (chunk.summaryRefId === undefined) {
				fieldChanged = true;
			} else {
				chunk.updateSummaryRefId(chunk.summaryRefId);
				if (summaryRefId === undefined) {
					summaryRefId = chunk.summaryRefId;
				}
				assert(
					summaryRefId === chunk.summaryRefId,
					"expected all chunks to have the same summary ref id",
				);
			}
		}

		// If the field has not changed since the last encoding and fullTree is false, store the previous summaryRefId
		// in the main buffer and set incremental field buffer for this field to unchanged.
		if (!fieldChanged && !dataBuilder.fullTree) {
			assert(
				summaryRefId !== undefined,
				"if field is unchanged, summary ref id must be defined",
			);
			dataBuilder.addToBuffer(summaryRefId);
			dataBuilder.addIncrementalFieldUnchanged(summaryRefId);
			return;
		}

		// If the field has changed, generate a new summaryRefId, store this into the main buffer and encode the field
		// data in the incremental field buffer.
		// TODO: Can we re-use previous summaryRefId in some cases for optimization?
		const fieldSummaryId = `${cache.idCompressor.generateCompressedId()}`;
		dataBuilder.addToBuffer(fieldSummaryId);

		const fieldDataBuilder = dataBuilder.createChild();
		anyFieldEncoder.encodeField(cursor, cache, fieldDataBuilder);
		dataBuilder.addIncrementalFieldChanged(
			fieldSummaryId,
			fieldDataBuilder.getBufferIncremental(),
		);

		// Update the chunks of all nodes in the field with the new summaryRefId. Also, add a reference to the chunks
		// which represents a ref to the chunk from the summary tree that holds its contents. This will ensure that if
		// the chunk changes, a copy will be created, removing the reference, summaryRefId and other incremental state.
		forEachNode(cursor, (nodeCursor) => {
			const chunk = tryGetChunk(nodeCursor);
			assert(chunk !== undefined, "could not find chunk for node cursor");
			chunk.updateSummaryRefId(fieldSummaryId);
			chunk.referenceAdded();
		});
	}

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape>,
	): EncodedChunkShape {
		const encodedIncrementalShape: EncodedIncrementalShape = 0;
		return {
			e: encodedIncrementalShape,
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
	dataBuilder: IEncodedDataBuilder,
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

	/**
	 * This also updates the `shapesFromSchema` map with the given schema name and its encoder.
	 */
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
		dataBuilder: IEncodedDataBuilder,
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
