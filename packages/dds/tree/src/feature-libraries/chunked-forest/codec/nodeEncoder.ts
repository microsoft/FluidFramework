/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";

import {
	type FieldKey,
	type ITreeCursorSynchronous,
	type TreeNodeSchemaIdentifier,
	forEachField,
	type Value,
} from "../../../core/index.js";
import { brand } from "../../../util/index.js";

import type { Counter, DeduplicationTable } from "./chunkCodecUtilities.js";
import { type BufferFormat, IdentifierToken, Shape } from "./chunkEncodingGeneric.js";
import {
	type EncoderContext,
	type FieldEncoder,
	type KeyedFieldEncoder,
	type NodeEncoder,
	encodeValue,
} from "./compressedEncode.js";
import {
	SpecialField,
	type EncodedChunkShape,
	type EncodedFieldShape,
	type EncodedValueShape,
	type EncodedChunkShapeVTextExperimental,
} from "./format/index.js";

/**
 * Encodes a node with the {@link EncodedNodeShape} shape.
 * @remarks
 * The fact this is also a Shape is an implementation detail of the encoder: that allows the shape it uses to be itself,
 * which is an easy way to keep all the related code together without extra objects.
 */
export class NodeShapeBasedEncoder extends Shape<EncodedChunkShape> implements NodeEncoder {
	/**
	 * Set of keys for fields that are encoded using {@link NodeShapeBasedEncoder.specializedFieldEncoders}.
	 * TODO: Ensure uniform chunks, encoding and identifier generation sort fields the same.
	 */
	private readonly specializedFieldKeys: Set<FieldKey>;

	public constructor(
		public readonly type: undefined | TreeNodeSchemaIdentifier,
		public readonly value: EncodedValueShape,
		/**
		 * Encoders for a specific set of fields, by key, in the order they will be encoded.
		 * These are fields for which specialized encoding is provided as an optimization.
		 * Using these for a given field instead of falling back to {@link NodeShapeBasedEncoder.specializedFieldEncoders} is often more efficient:
		 * this avoids the need to explicitly include the key and shape in the encoded data for each node instance.
		 * Instead, this information is here, and thus is encoded only once as part of the node shape.
		 * These encoders will be used, even if the field they apply to is empty (which can add overhead for fields which are usually empty).
		 *
		 * Any fields not included here will be encoded using {@link NodeShapeBasedEncoder.otherFieldsEncoder}.
		 * If {@link NodeShapeBasedEncoder.otherFieldsEncoder} is undefined, then this must handle all non-empty fields.
		 */
		public readonly specializedFieldEncoders: readonly KeyedFieldEncoder[],
		/**
		 * Encoder for all other fields that are not in {@link NodeShapeBasedEncoder.specializedFieldEncoders}. These fields must
		 * be encoded after the specialized fields.
		 */
		public readonly otherFieldsEncoder: undefined | FieldEncoder,
	) {
		super();
		this.specializedFieldKeys = new Set(this.specializedFieldEncoders.map((f) => f.key));
	}

	private getValueToEncode(cursor: ITreeCursorSynchronous, context: EncoderContext): Value {
		if (this.value === SpecialField.Identifier) {
			assert(typeof cursor.value === "string", 0x9aa /* identifier must be type string */);
			return context.encodePossiblyCompressedId(cursor.value);
		}
		return cursor.value;
	}

	public encodeNode(
		cursor: ITreeCursorSynchronous,
		context: EncoderContext,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void {
		if (this.type === undefined) {
			outputBuffer.push(new IdentifierToken(cursor.type));
		} else {
			assert(cursor.type === this.type, 0x741 /* type must match shape */);
		}
		encodeValue(this.getValueToEncode(cursor, context), this.value, outputBuffer);
		for (const fieldEncoder of this.specializedFieldEncoders) {
			cursor.enterField(brand(fieldEncoder.key));
			fieldEncoder.encoder.encodeField(cursor, context, outputBuffer);
			cursor.exitField();
		}

		const otherFieldsBuffer: BufferFormat<EncodedChunkShape> = [];

		forEachField(cursor, () => {
			const key = cursor.getFieldKey();
			if (!this.specializedFieldKeys.has(key)) {
				assert(
					this.otherFieldsEncoder !== undefined,
					0x742 /* had extra local fields when shape does not support them */,
				);
				otherFieldsBuffer.push(new IdentifierToken(key));
				this.otherFieldsEncoder.encodeField(cursor, context, otherFieldsBuffer);
			}
		});

		if (this.otherFieldsEncoder !== undefined) {
			outputBuffer.push(otherFieldsBuffer);
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
				fields: encodeFieldShapes(this.specializedFieldEncoders, identifiers, shapes),
				extraFields: encodeOptionalFieldShape(this.otherFieldsEncoder, shapes),
			},
		};
	}

	public countReferencedShapesAndIdentifiers(
		identifiers: Counter<string>,
		shapeDiscovered: (shape: Shape<EncodedChunkShape>) => void,
	): void {
		if (this.type !== undefined) {
			identifiers.add(this.type);
		}

		for (const fieldEncoder of this.specializedFieldEncoders) {
			identifiers.add(fieldEncoder.key);
			shapeDiscovered(fieldEncoder.encoder.shape);
		}

		if (this.otherFieldsEncoder !== undefined) {
			shapeDiscovered(this.otherFieldsEncoder.shape);
		}
	}

	public get shape(): Shape<EncodedChunkShape> {
		return this;
	}
}

/**
 * Encodes a node with the {@link EncodedSpecializedNodeShape} (`f`) shape.
 *
 * @remarks
 * Wraps a base {@link NodeShapeBasedEncoder} and overlays a set of field overrides — the
 * differences from the base shape, in either shapes or values. Emits a compact wire format
 * instead of repeating the full node shape.
 */
export class SpecializedNodeShapeEncoder
	extends Shape<EncodedChunkShape>
	implements NodeEncoder
{
	private readonly inner: NodeShapeBasedEncoder;

	public constructor(
		private readonly base: NodeShapeBasedEncoder,
		public readonly fieldOverrides: readonly KeyedFieldEncoder[],
		/**
		 * If provided, replaces the resolved base's value shape on the wire. Wrapping in an
		 * object distinguishes "no override" (omit) from an override to a specific shape
		 * including `undefined` (the implicit-prefix encoding).
		 */
		public readonly valueOverride?: { readonly value: EncodedValueShape },
	) {
		super();
		const overrideMap = new Map(fieldOverrides.map((override) => [override.key, override]));
		// Duplicate field keys would produce a wire format the decoder rejects.
		assert(
			overrideMap.size === fieldOverrides.length,
			"duplicate field key in SpecializedNodeShapeEncoder fieldOverrides",
		);
		const mergedFields: KeyedFieldEncoder[] = base.specializedFieldEncoders.map(
			(override) => overrideMap.get(override.key) ?? override,
		);
		for (const override of fieldOverrides) {
			if (!base.specializedFieldEncoders.some((field) => field.key === override.key)) {
				mergedFields.push(override);
			}
		}
		this.inner = new NodeShapeBasedEncoder(
			base.type,
			valueOverride === undefined ? base.value : valueOverride.value,
			mergedFields,
			base.otherFieldsEncoder,
		);
	}

	public encodeNode(
		cursor: ITreeCursorSynchronous,
		context: EncoderContext,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void {
		this.inner.encodeNode(cursor, context, outputBuffer);
	}

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
	): EncodedChunkShapeVTextExperimental {
		const baseIndex =
			shapes.valueToIndex.get(this.base) ??
			fail("SpecializedNodeShapeEncoder: base shape missing from shapes table");
		const f: {
			base: number;
			fields: EncodedFieldShape[];
			value?: EncodedValueShape;
		} = {
			base: baseIndex,
			fields: encodeFieldShapes(this.fieldOverrides, identifiers, shapes) ?? [],
		};
		if (this.valueOverride !== undefined) {
			f.value = this.valueOverride.value;
		}
		return { f };
	}

	public countReferencedShapesAndIdentifiers(
		identifiers: Counter<string>,
		shapeDiscovered: (shape: Shape<EncodedChunkShape>) => void,
	): void {
		shapeDiscovered(this.base);
		for (const override of this.fieldOverrides) {
			identifiers.add(override.key);
			shapeDiscovered(override.encoder.shape);
		}
	}

	public get shape(): this {
		return this;
	}
}

export function encodeFieldShapes(
	fieldEncoders: readonly KeyedFieldEncoder[],
	identifiers: DeduplicationTable<string>,
	shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
): EncodedFieldShape[] | undefined {
	if (fieldEncoders.length === 0) {
		return undefined;
	}
	return fieldEncoders.map((fieldEncoder) => [
		// key
		encodeIdentifier(fieldEncoder.key, identifiers),
		// shape
		shapes.valueToIndex.get(fieldEncoder.encoder.shape) ?? fail(0xb50 /* missing shape */),
	]);
}

function encodeIdentifier(
	identifier: string,
	identifiers: DeduplicationTable<string>,
): string | number {
	return identifiers.valueToIndex.get(identifier) ?? identifier;
}

function encodeOptionalIdentifier(
	identifier: string | undefined,
	identifiers: DeduplicationTable<string>,
): string | number | undefined {
	return identifier === undefined ? undefined : encodeIdentifier(identifier, identifiers);
}

function encodeOptionalFieldShape(
	encoder: FieldEncoder | undefined,
	shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
): number | undefined {
	return encoder === undefined ? undefined : dedupShape(encoder.shape, shapes);
}

function dedupShape(
	shape: Shape<EncodedChunkShape>,
	shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
): number {
	return shapes.valueToIndex.get(shape) ?? fail(0xb51 /* missing shape */);
}
