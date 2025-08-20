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
	type TreeChunk,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type Value,
	forEachNode,
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
	type EncodedNestedArrayShape,
	type EncodedValueShape,
	SpecialField,
	version,
} from "./format.js";
import type { ChunkReferenceId, IncrementalEncoder } from "./codecs.js";

/**
 * Encode data from `FieldBatch` into an `EncodedFieldBatch`.
 *
 * Optimized for encoded size and encoding performance.
 *
 * Most of the compression strategy comes from the policy provided via `context`.
 */
export function compressedEncode(
	fieldBatch: FieldBatch,
	context: EncoderContext,
): EncodedFieldBatch {
	const batchBuffer: BufferFormat[] = [];

	// Populate buffer, including shape and identifier references
	for (const cursor of fieldBatch) {
		const buffer: BufferFormat = [];
		anyFieldEncoder.encodeField(cursor, context, buffer);
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
		context: EncoderContext,
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
		context: EncoderContext,
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
		context: EncoderContext,
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
			context: EncoderContext,
			outputBuffer: BufferFormat,
		): void {
			forEachNode(cursor, () => encoder.encodeNode(cursor, context, outputBuffer));
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
			context: EncoderContext,
			outputBuffer: BufferFormat,
		): void {
			encoder.encodeNode(cursor, context, outputBuffer);
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
		context: EncoderContext,
		outputBuffer: BufferFormat,
		encoder: FieldEncoder,
	): void {
		outputBuffer.push(encoder.shape);
		encoder.encodeField(cursor, context, outputBuffer);
	}

	public static encodeNode(
		cursor: ITreeCursorSynchronous,
		context: EncoderContext,
		outputBuffer: BufferFormat,
		encoder: NodeEncoder,
	): void {
		outputBuffer.push(encoder.shape);
		encoder.encodeNode(cursor, context, outputBuffer);
	}

	public static encodeNodes(
		cursor: ITreeCursorSynchronous,
		context: EncoderContext,
		outputBuffer: BufferFormat,
		encoder: NodesEncoder,
	): void {
		outputBuffer.push(encoder.shape);
		encoder.encodeNodes(cursor, context, outputBuffer);
	}
}

/**
 * Encodes a single node polymorphically.
 */
export const anyNodeEncoder: NodeEncoder = {
	encodeNode(
		cursor: ITreeCursorSynchronous,
		context: EncoderContext,
		outputBuffer: BufferFormat,
	): void {
		// TODO: Fast path uniform chunk content.
		const shape = context.nodeEncoderFromSchema(cursor.type);
		AnyShape.encodeNode(cursor, context, outputBuffer, shape);
	},

	shape: AnyShape.instance,
};

/**
 * Encodes a field polymorphically.
 */
export const anyFieldEncoder: FieldEncoder = {
	encodeField(
		cursor: ITreeCursorSynchronous,
		context: EncoderContext,
		outputBuffer: BufferFormat,
	): void {
		// TODO: Fast path uniform chunks.

		if (cursor.getFieldLength() === 0) {
			const shape = InlineArrayEncoder.empty;
			AnyShape.encodeField(cursor, context, outputBuffer, shape);
		} else if (cursor.getFieldLength() === 1) {
			// Fast path chunk of size one size one at least: skip nested array.
			cursor.enterNode(0);
			anyNodeEncoder.encodeNode(cursor, context, outputBuffer);
			cursor.exitNode();
		} else {
			// TODO: more efficient encoding for common cases.
			// Could try to find more specific shape compatible with all children than `anyNodeEncoder`.

			const shape = context.nestedArrayEncoder(anyNodeEncoder);
			AnyShape.encodeField(cursor, context, outputBuffer, shape);
		}
	},

	shape: AnyShape.instance,
};

/**
 * Encodes a chunk using {@link EncodedInlineArrayShape}.
 * @remarks
 * The fact this is also a Shape is an implementation detail of the encoder: that allows the shape it uses to be itself,
 * which is an easy way to keep all the related code together without extra objects.
 */
export class InlineArrayEncoder
	extends ShapeGeneric<EncodedChunkShape>
	implements NodesEncoder, FieldEncoder
{
	public static readonly empty: InlineArrayEncoder = new InlineArrayEncoder(0, {
		get shape() {
			// Not actually used, makes count work without adding an additional shape.
			return InlineArrayEncoder.empty;
		},
		encodeNodes(
			cursor: ITreeCursorSynchronous,
			context: EncoderContext,
			outputBuffer: BufferFormat,
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
		context: EncoderContext,
		outputBuffer: BufferFormat,
	): void {
		// Linter is wrong about this loop being for-of compatible.
		// eslint-disable-next-line @typescript-eslint/prefer-for-of
		for (let index = 0; index < this.length; index++) {
			this.inner.encodeNodes(cursor, context, outputBuffer);
		}
	}

	public encodeField(
		cursor: ITreeCursorSynchronous,
		context: EncoderContext,
		outputBuffer: BufferFormat,
	): void {
		// Its possible individual items from this array encode multiple nodes, so don't assume === here.
		assert(
			cursor.getFieldLength() >= this.length,
			0x73c /* unexpected length for fixed length array */,
		);
		cursor.firstNode();
		this.encodeNodes(cursor, context, outputBuffer);
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
 * Encodes the shape for a nested array as {@link EncodedNestedArray} shape.
 */
export class NestedArrayShape extends ShapeGeneric<EncodedChunkShape> {
	/**
	 * @param innerShape - The shape of each item in this nested array.
	 */
	public constructor(public readonly innerShape: Shape) {
		super();
	}

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape>,
	): EncodedChunkShape {
		const shape: EncodedNestedArrayShape =
			shapes.valueToIndex.get(this.innerShape) ??
			fail(0xb4f /* index for shape not found in table */);
		return {
			a: shape,
		};
	}

	public countReferencedShapesAndIdentifiers(
		identifiers: Counter<string>,
		shapeDiscovered: (shape: Shape) => void,
	): void {
		shapeDiscovered(this.innerShape);
	}
}

/**
 * Encodes a field as a nested array with the {@link EncodedNestedArrayShape} shape.
 * @remarks
 * The fact this is also exposes a Shape is an implementation detail: it allows the shape it uses to be itself
 * which is an easy way to keep all the related code together without extra objects.
 */
export class NestedArrayEncoder implements FieldEncoder {
	public constructor(
		public readonly innerEncoder: NodeEncoder,
		public readonly shape: NestedArrayShape = new NestedArrayShape(innerEncoder.shape),
	) {}

	public encodeField(
		cursor: ITreeCursorSynchronous,
		context: EncoderContext,
		outputBuffer: BufferFormat,
	): void {
		const buffer: BufferFormat = [];
		let allNonZeroSize = true;
		const length = cursor.getFieldLength();
		forEachNode(cursor, () => {
			const before = buffer.length;
			this.innerEncoder.encodeNode(cursor, context, buffer);
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
}

/**
 * Encodes a chunk with the {@link EncodedIncrementalChunkShape} shape.
 * This chunks will be encoded separately, i.e., the contents of the chunk will not be part of the main buffer.
 * A reference to the chunk will be stored in the main buffer as an {@link ChunkReferenceId}.
 */
export class IncrementalChunkShape extends ShapeGeneric<EncodedChunkShape> {
	/**
	 * Encodes all the nodes in the chunk at the cursor position using `InlineArrayShape`.
	 */
	public static encodeChunk(chunk: TreeChunk, context: EncoderContext): BufferFormat {
		const chunkOutputBuffer: BufferFormat = [];
		const nodesEncoder = asNodesEncoder(anyNodeEncoder);
		const chunkCursor = chunk.cursor();
		chunkCursor.firstNode();
		const chunkLength = chunkCursor.chunkLength;
		for (let index = 0; index < chunkLength; index++) {
			nodesEncoder.encodeNodes(chunkCursor, context, chunkOutputBuffer);
		}
		assert(
			chunkCursor.mode === CursorLocationType.Fields,
			"should return to fields mode when finished encoding",
		);
		return chunkOutputBuffer;
	}

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape>,
	): EncodedChunkShape {
		return {
			e: 0 /* EncodedIncrementalChunkShape */,
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
 * Encodes an incremental field whose chunks are encoded separately and referenced by their {@link ChunkReferenceId}.
 * The shape of the content of this field is {@link NestedShape} where the items in the array are
 * the {@link ChunkReferenceId}s of the encoded chunks.
 */
export const incrementalFieldEncoder: FieldEncoder = {
	encodeField(
		cursor: ITreeCursorSynchronous,
		context: EncoderContext,
		outputBuffer: BufferFormat,
	): void {
		assert(
			context.shouldEncodeIncrementally,
			"incremental encoding must be enabled to use IncrementalFieldShape",
		);

		const chunkReferenceIds = context.encodeIncrementalField(cursor, (chunk: TreeChunk) =>
			IncrementalChunkShape.encodeChunk(chunk, context),
		);
		outputBuffer.push(chunkReferenceIds);
	},

	shape: new NestedArrayShape(new IncrementalChunkShape() /* innerShape */),
};

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
		} else if (shape === SpecialField.Identifier) {
			// This case is a special case handling the encoding of identifier fields.
			assert(value !== undefined, 0x998 /* required value must not be missing */);
			outputBuffer.push(value);
		} else {
			// EncodedCounter case:
			unreachableCase(shape, "Encoding values as deltas is not yet supported");
		}
	}
}

/**
 * Provides common contextual information during encoding, like schema and policy settings.
 * Also, provides a cache to avoid duplicating equivalent shapes during a batch of encode operations.
 * @remarks
 * To avoid Shape duplication, any Shapes used in the encoding should either be:
 * - Singletons defined in a static scope.
 * - Cached in this object for future reuse such that all equivalent Shapes are deduplicated.
 */
export class EncoderContext implements NodeEncodeBuilder, FieldEncodeBuilder {
	private readonly nodeEncodersFromSchema: Map<TreeNodeSchemaIdentifier, NodeEncoder> =
		new Map();
	private readonly nestedArrayEncoders: Map<NodeEncoder, NestedArrayEncoder> = new Map();
	public constructor(
		private readonly nodeEncoderFromPolicy: NodeEncoderPolicy,
		private readonly fieldEncoderFromPolicy: FieldEncoderPolicy,
		public readonly fieldShapes: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
		public readonly idCompressor: IIdCompressor,
		private readonly incrementalEncoder: IncrementalEncoder | undefined,
	) {}

	public nodeEncoderFromSchema(schemaName: TreeNodeSchemaIdentifier): NodeEncoder {
		return getOrCreate(this.nodeEncodersFromSchema, schemaName, () =>
			this.nodeEncoderFromPolicy(this, schemaName),
		);
	}

	public fieldEncoderFromSchema(fieldSchema: TreeFieldStoredSchema): FieldEncoder {
		return new LazyFieldEncoder(this, fieldSchema, this.fieldEncoderFromPolicy);
	}

	public nestedArrayEncoder(inner: NodeEncoder): NestedArrayEncoder {
		return getOrCreate(this.nestedArrayEncoders, inner, () => new NestedArrayEncoder(inner));
	}

	public get shouldEncodeIncrementally(): boolean {
		return this.incrementalEncoder !== undefined;
	}

	/**
	 * {@link IncrementalEncoder.encodeIncrementalField}
	 */
	public encodeIncrementalField(
		cursor: ITreeCursorSynchronous,
		encoder: (chunk: TreeChunk) => BufferFormat,
	): ChunkReferenceId[] {
		assert(this.incrementalEncoder !== undefined, "incremental encoding must be enabled");
		// Encoder for the chunk that encodes its data using the provided encoder function and
		// updates the encoded data for shapes and identifiers.
		const chunkEncoder = (chunk: TreeChunk): EncodedFieldBatch => {
			const chunkOutputBuffer = encoder(chunk);
			return updateShapesAndIdentifiersEncoding(version, [chunkOutputBuffer]);
		};
		return this.incrementalEncoder.encodeIncrementalField(cursor, chunkEncoder);
	}
}

export interface NodeEncodeBuilder {
	nodeEncoderFromSchema(schemaName: TreeNodeSchemaIdentifier): NodeEncoder;
}

export interface FieldEncodeBuilder {
	fieldEncoderFromSchema(schema: TreeFieldStoredSchema): FieldEncoder;
}

/**
 * The policy for building a {@link FieldEncoder} for a field.
 */
export type FieldEncoderPolicy = (
	nodeBuilder: NodeEncodeBuilder,
	schema: TreeFieldStoredSchema,
) => FieldEncoder;

/**
 * The policy for building a {@link NodeEncoder} for a node.
 */
export type NodeEncoderPolicy = (
	fieldBuilder: FieldEncodeBuilder,
	schemaName: TreeNodeSchemaIdentifier,
) => NodeEncoder;

class LazyFieldEncoder implements FieldEncoder {
	private encoderLazy: FieldEncoder | undefined;

	public constructor(
		public readonly nodeBuilder: NodeEncodeBuilder,
		public readonly fieldSchema: TreeFieldStoredSchema,
		private readonly fieldEncoderFromPolicy: FieldEncoderPolicy,
	) {}
	public encodeField(
		cursor: ITreeCursorSynchronous,
		context: EncoderContext,
		outputBuffer: BufferFormat,
	): void {
		this.encoder.encodeField(cursor, context, outputBuffer);
	}

	private get encoder(): FieldEncoder {
		if (this.encoderLazy === undefined) {
			this.encoderLazy = this.fieldEncoderFromPolicy(this.nodeBuilder, this.fieldSchema);
		}
		return this.encoderLazy;
	}

	public get shape(): Shape {
		return this.encoder.shape;
	}
}
