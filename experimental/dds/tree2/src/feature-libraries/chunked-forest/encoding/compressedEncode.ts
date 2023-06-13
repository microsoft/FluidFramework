/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import {
	FieldStoredSchema,
	ITreeCursorSynchronous,
	TreeSchemaIdentifier,
	Value,
	forEachNode,
} from "../../../core";
import { fail, getOrCreate } from "../../../util";
import { BufferFormat, Shape, handleShapesAndIdentifiers } from "./chunkEncodingGeneric";
import { Counter, DeduplicationTable } from "./chunkEncodingUtilities";
import { EncodedChunk, version, EncodedChunkShape, EncodedValueShape } from "./format";

/**
 * Encode data from `cursor` in into an `EncodedChunk`.
 *
 * Optimized for encoded size and encoding performance.
 */
export function compressedEncode(
	cursor: ITreeCursorSynchronous,
	cache: EncoderCache,
): EncodedChunk {
	const buffer: BufferFormat<EncodedChunkShape> = [];

	// Populate buffer, including shape and identifier references
	anyFieldEncoder.encodeField(cursor, cache, buffer);
	return handleShapesAndIdentifiers(version, buffer);
}

// Encodes a chunk polymorphically.
class AnyShape extends Shape<EncodedChunkShape> {
	private constructor() {
		super();
	}
	public static readonly instance = new AnyShape();

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
	): EncodedChunkShape {
		return { d: 0 };
	}

	public count(
		identifiers: Counter<string>,
		shapes: (shape: Shape<EncodedChunkShape>) => void,
	): void {}

	public static encodeField(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat<EncodedChunkShape>,
		shape: FieldEncoderShape,
	) {
		outputBuffer.push(shape.shape);
		shape.encodeField(cursor, cache, outputBuffer);
	}

	public static encodeNodes(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat<EncodedChunkShape>,
		shape: NodeEncoderShape,
	) {
		outputBuffer.push(shape.shape);
		shape.encodeNodes(cursor, cache, outputBuffer);
	}
}

// Encodes a single node polymorphically.
export const anyNodeEncoder: NodeEncoderShape = {
	encodeNodes(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void {
		// TODO: Fast path uniform chunk content.
		const shape = cache.shapeFromTree(cursor.type);
		AnyShape.encodeNodes(cursor, cache, outputBuffer, shape);
	},

	shape: AnyShape.instance,
};

// Encodes a field polymorphically.
export const anyFieldEncoder: FieldEncoderShape = {
	encodeField(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void {
		// TODO: Fast path uniform chunks.

		// Fast path chunk of size one size one at least: skip nested array.
		if (cursor.getFieldLength() === 1) {
			cursor.enterNode(0);
			anyNodeEncoder.encodeNodes(cursor, cache, outputBuffer);
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

export class InlineArrayShape extends Shape<EncodedChunkShape> implements NodeEncoderShape {
	public constructor(public readonly length: number, public readonly inner: NodeEncoderShape) {
		super();
	}

	public encodeNodes(
		cursor: ITreeCursorSynchronous,
		shapes: EncoderCache,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void {
		// Linter is wrong about this loop being for-of compatible.
		// eslint-disable-next-line @typescript-eslint/prefer-for-of
		for (let index = 0; index < this.length; index++) {
			this.shape.encodeNodes(cursor, shapes, outputBuffer);
		}
	}
	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
	): EncodedChunkShape {
		return {
			b: {
				length: this.length,
				shape: shapes.valueToIndex.get(this.inner.shape) ?? fail(""),
			},
		};
	}

	public count(
		identifiers: Counter<string>,
		shapes: (shape: Shape<EncodedChunkShape>) => void,
	): void {
		shapes(this.inner.shape);
	}

	public get shape() {
		return this;
	}
}

class NestedArrayShape extends Shape<EncodedChunkShape> implements FieldEncoderShape {
	public readonly shape: Shape<EncodedChunkShape>;

	public constructor(public readonly inner: NodeEncoderShape) {
		super();
		this.shape = this;
	}

	public encodeField(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void {
		const buffer: BufferFormat<EncodedChunkShape> = [];
		forEachNode(cursor, () => {
			this.inner.encodeNodes(cursor, cache, buffer);
		});
		outputBuffer.push(buffer);
	}

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
	): EncodedChunkShape {
		return {
			a: shapes.valueToIndex.get(this.inner.shape) ?? fail(""),
		};
	}

	public count(
		identifiers: Counter<string>,
		shapes: (shape: Shape<EncodedChunkShape>) => void,
	): void {
		shapes(this.inner.shape);
	}
}

export function encodeValue(
	value: Value,
	shape: EncodedValueShape,
	outputBuffer: BufferFormat<EncodedChunkShape>,
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

export interface FieldShape<TKey> {
	readonly key: TKey;
	readonly shape: FieldEncoderShape;
}

export function encodeFieldShapes(
	fields: readonly FieldShape<string>[],
	identifiers: DeduplicationTable<string>,
	shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
) {
	return fields.map((field) => ({
		key: encodeIdentifier(field.key, identifiers),
		shape: shapes.valueToIndex.get(field.shape.shape) ?? fail("missing shape"),
	}));
}

function encodeIdentifier(identifier: string, identifiers: DeduplicationTable<string>) {
	return identifiers.valueToIndex.get(identifier) ?? identifier;
}

export function encodeOptionalIdentifier(
	identifier: string | undefined,
	identifiers: DeduplicationTable<string>,
) {
	return identifier === undefined ? undefined : encodeIdentifier(identifier, identifiers);
}

function dedupShape(
	shape: Shape<EncodedChunkShape>,
	shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
) {
	return shapes.valueToIndex.get(shape) ?? fail("missing shape");
}

export function encodeOptionalFieldShape(
	shape: FieldEncoderShape | undefined,
	shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
) {
	return shape === undefined ? undefined : dedupShape(shape.shape, shapes);
}

export interface NodeEncoderShape {
	/**
	 * @param cursor - in Nodes mode. Moves cursor however many nodes it encodes.
	 */
	encodeNodes(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void;

	readonly shape: Shape<EncodedChunkShape>;
}

export interface FieldEncoderShape {
	/**
	 * @param cursor - in Fields mode. Encodes entire field.
	 */
	encodeField(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void;

	readonly shape: Shape<EncodedChunkShape>;
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
		outputBuffer: BufferFormat<NodeEncoderShape>,
	): void {
		this.encoder.encodeField(cursor, cache, outputBuffer);
	}

	private get encoder(): FieldEncoderShape {
		if (this.encoderLazy === undefined) {
			this.encoderLazy = this.fieldEncoder(this.cache, this.field);
		}
		return this.encoderLazy;
	}

	public get shape(): Shape<EncodedChunkShape> {
		return this.encoder.shape;
	}
}
