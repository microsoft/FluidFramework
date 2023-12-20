/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import {
	CursorLocationType,
	FieldKey,
	TreeFieldStoredSchema,
	ITreeCursorSynchronous,
	TreeNodeSchemaIdentifier,
	Value,
	forEachNode,
	FieldKindIdentifier,
} from "../../../core";
import { fail, getOrCreate } from "../../../util";
import { type FieldKind } from "../../modular-schema";
import {
	BufferFormat as BufferFormatGeneric,
	Shape as ShapeGeneric,
	handleShapesAndIdentifiers,
} from "./chunkEncodingGeneric";
import { Counter, DeduplicationTable } from "./chunkCodecUtilities";
import {
	version,
	EncodedChunkShape,
	EncodedValueShape,
	EncodedAnyShape,
	EncodedNestedArray,
	EncodedFieldBatch,
} from "./format";
import { FieldBatch } from "./fieldBatch";

/**
 * Encode data from `FieldBatch` in into an `EncodedChunk`.
 *
 * Optimized for encoded size and encoding performance.
 *
 * Most of the compression strategy comes from the policy provided via `cache`.
 */
export function compressedEncode(fieldBatch: FieldBatch, cache: EncoderCache): EncodedFieldBatch {
	const batchBuffer: BufferFormat[] = [];

	// Populate buffer, including shape and identifier references
	for (const cursor of fieldBatch) {
		const buffer: BufferFormat = [];
		anyFieldEncoder.encodeField(cursor, cache, buffer);
		batchBuffer.push(buffer);
	}
	return handleShapesAndIdentifiers(version, batchBuffer);
}

export type BufferFormat = BufferFormatGeneric<EncodedChunkShape>;
export type Shape = ShapeGeneric<EncodedChunkShape>;

/**
 * Like {@link FieldEncoder}, except data will be prefixed with the key.
 */
export interface KeyedFieldEncoder {
	readonly key: FieldKey;
	readonly shape: FieldEncoder;
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
		outputBuffer: BufferFormat,
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
		outputBuffer: BufferFormat,
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
		outputBuffer: BufferFormat,
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
			outputBuffer: BufferFormat,
		): void {
			forEachNode(cursor, () => encoder.encodeNode(cursor, shapes, outputBuffer));
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
			outputBuffer: BufferFormat,
		): void {
			encoder.encodeNode(cursor, shapes, outputBuffer);
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

	public count(identifiers: Counter<string>, shapes: (shape: Shape) => void): void {}

	public static encodeField(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat,
		shape: FieldEncoder,
	) {
		outputBuffer.push(shape.shape);
		shape.encodeField(cursor, cache, outputBuffer);
	}

	public static encodeNode(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat,
		shape: NodeEncoder,
	) {
		outputBuffer.push(shape.shape);
		shape.encodeNode(cursor, cache, outputBuffer);
	}

	public static encodeNodes(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat,
		shape: NodesEncoder,
	) {
		outputBuffer.push(shape.shape);
		shape.encodeNodes(cursor, cache, outputBuffer);
	}
}

/**
 * Encodes a single node polymorphically.
 */
export const anyNodeEncoder: NodeEncoder = {
	encodeNode(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat,
	): void {
		// TODO: Fast path uniform chunk content.
		const shape = cache.shapeFromTree(cursor.type);
		AnyShape.encodeNode(cursor, cache, outputBuffer, shape);
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
		outputBuffer: BufferFormat,
	): void {
		// TODO: Fast path uniform chunks.

		if (cursor.getFieldLength() === 0) {
			const shape = InlineArrayShape.empty;
			AnyShape.encodeField(cursor, cache, outputBuffer, shape);
		} else if (cursor.getFieldLength() === 1) {
			// Fast path chunk of size one size one at least: skip nested array.
			cursor.enterNode(0);
			anyNodeEncoder.encodeNode(cursor, cache, outputBuffer);
			cursor.exitNode();
		} else {
			// TODO: more efficient encoding for common cases.
			// Could try to find more specific shape compatible with all children than `anyNodeEncoder`.

			const shape = cache.nestedArray(anyNodeEncoder);
			AnyShape.encodeField(cursor, cache, outputBuffer, shape);
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
			outputBuffer: BufferFormat,
		): void {
			fail("Empty array should not encode any nodes");
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
		outputBuffer: BufferFormat,
	): void {
		// Linter is wrong about this loop being for-of compatible.
		// eslint-disable-next-line @typescript-eslint/prefer-for-of
		for (let index = 0; index < this.length; index++) {
			this.inner.encodeNodes(cursor, shapes, outputBuffer);
		}
	}

	public encodeField(
		cursor: ITreeCursorSynchronous,
		shapes: EncoderCache,
		outputBuffer: BufferFormat,
	): void {
		// Its possible individual items from this array encode multiple nodes, so don't assume === here.
		assert(
			cursor.getFieldLength() >= this.length,
			0x73c /* unexpected length for fixed length array */,
		);
		cursor.firstNode();
		this.encodeNodes(cursor, shapes, outputBuffer);
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
				shape: shapes.valueToIndex.get(this.inner.shape) ?? fail("missing shape"),
			},
		};
	}

	public count(identifiers: Counter<string>, shapes: (shape: Shape) => void): void {
		shapes(this.inner.shape);
	}

	public get shape() {
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
		outputBuffer: BufferFormat,
	): void {
		const buffer: BufferFormat = [];
		let allNonZeroSize = true;
		const length = cursor.getFieldLength();
		forEachNode(cursor, () => {
			const before = buffer.length;
			this.inner.encodeNode(cursor, cache, buffer);
			allNonZeroSize &&= buffer.length - before !== 0;
		});
		if (buffer.length === 0) {
			// This relies on the number of inner chunks being the same as the number of nodes.
			// If making inner a `NodesEncoder`, this code will have to be adjusted accordingly.
			outputBuffer.push(length);
		} else {
			assert(
				allNonZeroSize,
				0x73e /* either all or none of the members of a nested array must be 0 sized, or there is no way the decoder could process the content correctly. */,
			);
			outputBuffer.push(buffer);
		}
	}

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape>,
	): EncodedChunkShape {
		const shape: EncodedNestedArray =
			shapes.valueToIndex.get(this.inner.shape) ?? fail("index for shape not found in table");
		return {
			a: shape,
		};
	}

	public count(identifiers: Counter<string>, shapes: (shape: Shape) => void): void {
		shapes(this.inner.shape);
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
	outputBuffer: BufferFormat,
): void {
	if (shape === undefined) {
		if (value !== undefined) {
			outputBuffer.push(true, value);
		} else {
			outputBuffer.push(false);
		}
	} else {
		if (shape === true) {
			assert(value !== undefined, 0x78d /* required value must not be missing */);
			outputBuffer.push(value);
		} else if (shape === false) {
			assert(value === undefined, 0x73f /* incompatible value shape: expected no value */);
		} else if (Array.isArray(shape)) {
			assert(shape.length === 1, 0x740 /* expected a single constant for value */);
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
		public readonly fieldShapes: ReadonlyMap<FieldKindIdentifier, FieldKind>,
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
		outputBuffer: BufferFormat,
	): void {
		this.encoder.encodeField(cursor, cache, outputBuffer);
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
