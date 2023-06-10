/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import {
	CursorLocationType,
	FieldKey,
	FieldStoredSchema,
	GlobalFieldKey,
	ITreeCursorSynchronous,
	LocalFieldKey,
	SchemaDataAndPolicy,
	TreeSchemaIdentifier,
	Value,
	ValueSchema,
	forEachField,
	forEachNode,
	isGlobalFieldKey,
	lookupGlobalFieldSchema,
	symbolFromKey,
} from "../../../core";
import { FullSchemaPolicy, Multiplicity } from "../../modular-schema";
import { brand, fail, getOrCreate } from "../../../util";
import { FieldKinds } from "../../defaultFieldKinds";
import { getFieldKind } from "../../contextuallyTyped";
import {
	BufferFormat,
	IdentifierToken,
	Shape,
	handleShapesAndIdentifiers,
} from "./chunkEncodingGeneric";
import { Counter, DeduplicationTable } from "./chunkEncodingUtilities";
import { EncodedChunk, version, EncodedChunkShape, EncodedValueShape } from "./format";

/**
 * Encode data from `cursor` in into an `EncodedChunk`.
 *
 * Optimized for encoded size and encoding performance.
 */
export function compressedEncode(
	schema: SchemaDataAndPolicy<FullSchemaPolicy>,
	cursor: ITreeCursorSynchronous,
): EncodedChunk {
	const buffer: BufferFormat<EncodedChunkShape> = [];

	const cache = new EncoderCache(schema);

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
}

// Encodes a single node polymorphically.
const anyNodeEncoder: NodeEncoderShape = {
	encodeNodes(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void {
		// TODO: Fast path uniform chunk content.
		const shape = cache.shapeFromSchema(cursor.type);
		outputBuffer.push(shape.shape);
		shape.encodeNodes(cursor, cache, outputBuffer);
	},

	shape: AnyShape.instance,
};

// Encodes a field polymorphically.
const anyFieldEncoder: FieldEncoderShape = {
	encodeField(
		cursor: ITreeCursorSynchronous,
		shapes: EncoderCache,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void {
		// TODO: more pick more efficient shape than `anyArray`.
		// Fast path uniform chunks and arrays of size one at least.
		encodeFieldAsNestedArray(cursor, shapes, outputBuffer, anyNodeEncoder);
	},

	shape: AnyShape.instance,
};

function encodeFieldAsNestedArray(
	cursor: ITreeCursorSynchronous,
	shapes: EncoderCache,
	outputBuffer: BufferFormat<EncodedChunkShape>,
	innerShape: NodeEncoderShape,
): void {
	outputBuffer.push(shapes.nestedArray(innerShape));
	const buffer: BufferFormat<EncodedChunkShape> = [];
	forEachNode(cursor, () => {
		anyNodeEncoder.encodeNodes(cursor, shapes, outputBuffer);
	});
	outputBuffer.push(buffer);
}

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

function asFieldEncoder(encoder: NodeEncoderShape): FieldEncoderShape {
	return {
		encodeField(
			cursor: ITreeCursorSynchronous,
			shapes: EncoderCache,
			outputBuffer: BufferFormat<EncodedChunkShape>,
		): void {
			assert(cursor.mode === CursorLocationType.Fields, "unexpected mode");
			cursor.firstNode();
			encoder.encodeNodes(cursor, shapes, outputBuffer);
			assert(cursor.mode === CursorLocationType.Fields, "unexpected mode");
		},
		shape: encoder.shape,
	};
}

class NestedArrayShape extends Shape<EncodedChunkShape> {
	public constructor(public readonly inner: NodeEncoderShape) {
		super();
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

function encodeValue(
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

interface FieldShape<TKey> {
	readonly key: TKey;
	readonly shape: FieldEncoderShape;
}

function encodeFieldShapes(
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

function encodeOptionalIdentifier(
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

function encodeOptionalFieldShape(
	shape: FieldEncoderShape | undefined,
	shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
) {
	return shape === undefined ? undefined : dedupShape(shape.shape, shapes);
}

export class TreeShape extends Shape<EncodedChunkShape> implements NodeEncoderShape {
	private readonly fields: FieldShape<FieldKey>[];
	private readonly explicitKeys: Set<FieldKey>;

	public constructor(
		public readonly type: undefined | TreeSchemaIdentifier,
		public readonly value: EncodedValueShape,
		public readonly local: readonly FieldShape<LocalFieldKey>[],
		public readonly global: readonly FieldShape<GlobalFieldKey>[],
		public readonly extraLocal: undefined | FieldEncoderShape,
		public readonly extraGlobal: undefined | FieldEncoderShape,
	) {
		super();

		this.fields = [...this.local];
		for (const field of this.global) {
			this.fields.push({ key: symbolFromKey(field.key), shape: field.shape });
		}
		this.explicitKeys = new Set(this.fields.map((f) => f.key));
	}

	public encodeNodes(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void {
		if (this.type === undefined) {
			outputBuffer.push(new IdentifierToken(cursor.type));
		} else {
			assert(cursor.type === this.type, "type must match shape");
		}

		encodeValue(cursor.value, this.value, outputBuffer);

		for (const field of this.fields) {
			cursor.enterField(brand(field.key));
			field.shape.encodeField(cursor, cache, outputBuffer);
			cursor.exitField();
		}

		const localBuffer: BufferFormat<EncodedChunkShape> = [];
		const globalBuffer: BufferFormat<EncodedChunkShape> = [];

		forEachField(cursor, () => {
			const key = cursor.getFieldKey();
			if (!this.explicitKeys.has(key)) {
				if (isGlobalFieldKey(key)) {
					assert(
						this.extraGlobal !== undefined,
						"had extra global fields when shape does not support them",
					);
					this.extraGlobal.encodeField(cursor, cache, globalBuffer);
				} else {
					assert(
						this.extraLocal !== undefined,
						"had extra local fields when shape does not support them",
					);
					this.extraLocal.encodeField(cursor, cache, localBuffer);
				}
			}
		});

		if (this.extraLocal !== undefined) {
			outputBuffer.push(localBuffer);
		}
		if (this.extraGlobal !== undefined) {
			outputBuffer.push(globalBuffer);
		}
	}

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
	): EncodedChunkShape {
		return {
			c: {
				type: encodeOptionalIdentifier(this.type, identifiers),
				value: this.value,
				local: encodeFieldShapes(this.local, identifiers, shapes),
				global: encodeFieldShapes(this.global, identifiers, shapes),
				extraLocal: encodeOptionalFieldShape(this.extraLocal, shapes),
				extraGlobal: encodeOptionalFieldShape(this.extraGlobal, shapes),
			},
		};
	}

	public count(
		identifiers: Counter<string>,
		shapes: (shape: Shape<EncodedChunkShape>) => void,
	): void {
		if (this.type !== undefined) {
			identifiers.add(this.type);
		}
		for (const fields of [this.local, this.global]) {
			for (const field of fields) {
				identifiers.add(field.key);
				shapes(field.shape.shape);
			}
		}
		if (this.extraLocal !== undefined) {
			shapes(this.extraLocal.shape);
		}
		if (this.extraGlobal !== undefined) {
			shapes(this.extraGlobal.shape);
		}
	}

	public get shape() {
		return this;
	}
}

interface NodeEncoderShape {
	/**
	 * @param cursor - in Nodes mode. Moves cursor however many nodes it encodes.
	 */
	encodeNodes(
		cursor: ITreeCursorSynchronous,
		shapes: EncoderCache,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void;

	readonly shape: Shape<EncodedChunkShape>;
}

interface FieldEncoderShape {
	/**
	 * @param cursor - in Fields mode. Encodes entire field.
	 */
	encodeField(
		cursor: ITreeCursorSynchronous,
		shapes: EncoderCache,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void;

	readonly shape: Shape<EncodedChunkShape>;
}

class EncoderCache {
	private readonly shapesFromSchema: Map<TreeSchemaIdentifier, TreeShape> = new Map();
	private readonly nestedArrays: Map<NodeEncoderShape, NestedArrayShape> = new Map();
	public constructor(public readonly schema: SchemaDataAndPolicy<FullSchemaPolicy>) {}

	public shapeFromSchema(schemaName: TreeSchemaIdentifier): TreeShape {
		return getOrCreate(this.shapesFromSchema, schemaName, (): TreeShape => {
			const schema = this.schema.treeSchema.get(schemaName) ?? fail("missing schema");

			const local: FieldShape<LocalFieldKey>[] = [];
			for (const [key, field] of schema.localFields) {
				local.push({ key, shape: new LazyFieldEncoder(this, field) });
			}

			const global: FieldShape<GlobalFieldKey>[] = [];
			for (const key of schema.globalFields) {
				const field = lookupGlobalFieldSchema(this.schema, key);
				global.push({ key, shape: new LazyFieldEncoder(this, field) });
			}

			const shape = new TreeShape(
				schemaName,
				valueShapeFromSchema(schema.value),
				local,
				global,
				schema.extraLocalFields.kind.identifier === FieldKinds.forbidden.identifier
					? undefined
					: new LazyFieldEncoder(this, schema.extraLocalFields),
				schema.extraGlobalFields ? undefined : anyFieldEncoder,
			);
			return shape;
		});
	}

	public nestedArray(inner: NodeEncoderShape): NestedArrayShape {
		return getOrCreate(this.nestedArrays, inner, () => new NestedArrayShape(inner));
	}
}

class LazyFieldEncoder implements FieldEncoderShape {
	private encoderLazy: FieldEncoderShape | undefined;

	public constructor(
		public readonly cache: EncoderCache,
		public readonly field: FieldStoredSchema,
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
			const kind = getFieldKind(this.field);
			const type = oneFromSet(this.field.types);
			// eslint-disable-next-line unicorn/prefer-ternary
			if (kind.multiplicity === Multiplicity.Value) {
				this.encoderLazy = asFieldEncoder(
					type !== undefined ? this.cache.shapeFromSchema(type) : anyNodeEncoder,
				);
			} else {
				this.encoderLazy = anyFieldEncoder;
			}
		}
		return this.encoderLazy;
	}

	public get shape(): Shape<EncodedChunkShape> {
		return this.encoder.shape;
	}
}

function oneFromSet<T>(set: ReadonlySet<T> | undefined): T | undefined {
	if (set === undefined) {
		return undefined;
	}
	if (set.size !== 1) {
		return undefined;
	}
	for (const item of set) {
		return item;
	}
}

function valueShapeFromSchema(schema: ValueSchema): undefined | EncodedValueShape {
	switch (schema) {
		case ValueSchema.Nothing:
			return false;
		case ValueSchema.Number:
		case ValueSchema.String:
		case ValueSchema.Boolean:
			return true;
		case ValueSchema.Serializable:
			return undefined;
		default:
			unreachableCase(schema);
	}
}
