/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import {
	CursorLocationType,
	FieldStoredSchema,
	ITreeCursorSynchronous,
	TreeSchemaIdentifier,
	Value,
	forEachNode,
} from "../../../core";
import { fail, getOrCreate } from "../../../util";
import {
	BufferFormat as BufferFormatGeneric,
	Shape as ShapeGeneric,
	handleShapesAndIdentifiers,
} from "./chunkEncodingGeneric";
import { Counter, DeduplicationTable } from "./chunkCodecUtilities";
import { EncodedChunk, version, EncodedChunkShape, EncodedValueShape } from "./format";

/**
 * Encode data from `cursor` in into an `EncodedChunk`.
 *
 * Optimized for encoded size and encoding performance.
 *
 * Most of the compression strategy comes from the policy provided via `cache`.
 */
export function compressedEncode(
	cursor: ITreeCursorSynchronous,
	cache: EncoderCache,
): EncodedChunk {
	const buffer: BufferFormat = [];

	// Populate buffer, including shape and identifier references
	anyFieldEncoder.encodeField(cursor, cache, buffer);
	return handleShapesAndIdentifiers(version, buffer);
}

export type BufferFormat = BufferFormatGeneric<EncodedChunkShape>;
export type Shape = ShapeGeneric<EncodedChunkShape>;

export interface FieldShape<TKey> {
	readonly key: TKey;
	readonly shape: FieldEncoderShape;
}

export interface NodeEncoderShape {
	/**
	 * @param cursor - in Nodes mode. Does not move cursor.
	 */
	encodeNode(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat,
	): void;

	readonly shape: Shape;
}

export interface NodesEncoderShape {
	/**
	 * @param cursor - in Nodes mode. Moves cursor however many nodes it encodes.
	 */
	encodeNodes(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat,
	): void;

	readonly shape: Shape;
}

export interface FieldEncoderShape {
	/**
	 * @param cursor - in Fields mode. Encodes entire field.
	 */
	encodeField(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat,
	): void;

	readonly shape: Shape;
}

export function asFieldEncoder(encoder: NodeEncoderShape): FieldEncoderShape {
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

export function asNodesEncoder(encoder: NodeEncoderShape): NodesEncoderShape {
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

// Encodes a chunk polymorphically.
class AnyShape extends ShapeGeneric<EncodedChunkShape> {
	private constructor() {
		super();
	}
	public static readonly instance = new AnyShape();

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape>,
	): EncodedChunkShape {
		return { d: 0 };
	}

	public count(identifiers: Counter<string>, shapes: (shape: Shape) => void): void {}

	public static encodeField(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat,
		shape: FieldEncoderShape,
	) {
		outputBuffer.push(shape.shape);
		shape.encodeField(cursor, cache, outputBuffer);
	}

	public static encodeNode(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat,
		shape: NodeEncoderShape,
	) {
		outputBuffer.push(shape.shape);
		shape.encodeNode(cursor, cache, outputBuffer);
	}

	public static encodeNodes(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat,
		shape: NodesEncoderShape,
	) {
		outputBuffer.push(shape.shape);
		shape.encodeNodes(cursor, cache, outputBuffer);
	}
}

// Encodes a single node polymorphically.
export const anyNodeEncoder: NodeEncoderShape = {
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

// Encodes a field polymorphically.
export const anyFieldEncoder: FieldEncoderShape = {
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

export class InlineArrayShape
	extends ShapeGeneric<EncodedChunkShape>
	implements NodesEncoderShape, FieldEncoderShape
{
	public static readonly empty: InlineArrayShape = new InlineArrayShape(0, {
		get shape() {
			// Not actually used, makes count work without adding an additional dep.
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
	public constructor(public readonly length: number, public readonly inner: NodesEncoderShape) {
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
		assert(cursor.getFieldLength() >= this.length, "unexpected length for fixed length array");
		cursor.firstNode();
		this.encodeNodes(cursor, shapes, outputBuffer);
		assert(
			cursor.mode === CursorLocationType.Fields,
			"should return to fields mode when finished encoding",
		);
	}

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape>,
	): EncodedChunkShape {
		return {
			b: {
				length: this.length,
				shape: shapes.valueToIndex.get(this.inner.shape) ?? fail(""),
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

export class NestedArrayShape extends ShapeGeneric<EncodedChunkShape> implements FieldEncoderShape {
	public readonly shape: Shape;

	public constructor(public readonly inner: NodeEncoderShape) {
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
			// If making inner a `NodesEncoderShape`, this code will have to be adjusted accordingly.
			outputBuffer.push(length);
		} else {
			assert(
				allNonZeroSize,
				"either all or none of the members of a nested array must be 0 sized, or there is no way the decoder could process the content correctly.",
			);
			outputBuffer.push(buffer);
		}
	}

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape>,
	): EncodedChunkShape {
		return {
			a: shapes.valueToIndex.get(this.inner.shape) ?? fail(""),
		};
	}

	public count(identifiers: Counter<string>, shapes: (shape: Shape) => void): void {
		shapes(this.inner.shape);
	}
}

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
			outputBuffer.push(value);
		} else if (shape === false) {
			assert(value === undefined, "incompatible value shape: expected no value");
		} else if (Array.isArray(shape)) {
			assert(shape.length === 1, "expected a single constant for value");
		} else {
			// EncodedCounter case:
			unreachableCase(shape, "Encoding values as deltas is not yet supported");
		}
	}
}

export class EncoderCache implements TreeShaper, FieldShaper {
	private readonly shapesFromSchema: Map<TreeSchemaIdentifier, NodeEncoderShape> = new Map();
	private readonly nestedArrays: Map<NodeEncoderShape, NestedArrayShape> = new Map();
	public constructor(
		private readonly treeEncoder: TreeShapePolicy,
		private readonly fieldEncoder: FieldShapePolicy,
	) {}

	public shapeFromTree(schemaName: TreeSchemaIdentifier): NodeEncoderShape {
		return getOrCreate(this.shapesFromSchema, schemaName, () =>
			this.treeEncoder(this, schemaName),
		);
	}

	public nestedArray(inner: NodeEncoderShape): NestedArrayShape {
		return getOrCreate(this.nestedArrays, inner, () => new NestedArrayShape(inner));
	}

	public shapeFromField(field: FieldStoredSchema): FieldEncoderShape {
		return new LazyFieldEncoder(this, field, this.fieldEncoder);
	}
}

export interface TreeShaper {
	shapeFromTree(schemaName: TreeSchemaIdentifier): NodeEncoderShape;
}

export interface FieldShaper {
	shapeFromField(field: FieldStoredSchema): FieldEncoderShape;
}

export type FieldShapePolicy = (
	treeShaper: TreeShaper,
	field: FieldStoredSchema,
) => FieldEncoderShape;

export type TreeShapePolicy = (
	fieldShaper: FieldShaper,
	schemaName: TreeSchemaIdentifier,
) => NodeEncoderShape;

class LazyFieldEncoder implements FieldEncoderShape {
	private encoderLazy: FieldEncoderShape | undefined;

	public constructor(
		public readonly cache: TreeShaper,
		public readonly field: FieldStoredSchema,
		private readonly fieldEncoder: FieldShapePolicy,
	) {}
	public encodeField(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat,
	): void {
		this.encoder.encodeField(cursor, cache, outputBuffer);
	}

	private get encoder(): FieldEncoderShape {
		if (this.encoderLazy === undefined) {
			this.encoderLazy = this.fieldEncoder(this.cache, this.field);
		}
		return this.encoderLazy;
	}

	public get shape(): Shape {
		return this.encoder.shape;
	}
}
