/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	FieldKey,
	ITreeCursorSynchronous,
	TreeSchemaIdentifier,
	forEachField,
} from "../../../core";
import { brand, fail } from "../../../util";
import { BufferFormat, IdentifierToken, Shape } from "./chunkEncodingGeneric";
import { Counter, DeduplicationTable } from "./chunkCodecUtilities";
import { EncodedChunkShape, EncodedFieldShape, EncodedValueShape } from "./format";
import {
	NodeEncoder,
	KeyedFieldEncoder,
	FieldEncoder,
	EncoderCache,
	encodeValue,
} from "./compressedEncode";

export class NodeShape extends Shape<EncodedChunkShape> implements NodeEncoder {
	// TODO: Ensure uniform chunks, encoding and identifier generation sort fields the same.
	private readonly explicitKeys: Set<FieldKey>;

	public constructor(
		public readonly type: undefined | TreeSchemaIdentifier,
		public readonly value: EncodedValueShape,
		public readonly fields: readonly KeyedFieldEncoder[],
		public readonly extraLocal: undefined | FieldEncoder,
	) {
		super();
		this.explicitKeys = new Set(this.fields.map((f) => f.key));
	}

	public encodeNode(
		cursor: ITreeCursorSynchronous,
		cache: EncoderCache,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void {
		if (this.type === undefined) {
			outputBuffer.push(new IdentifierToken(cursor.type));
		} else {
			assert(cursor.type === this.type, 0x741 /* type must match shape */);
		}

		encodeValue(cursor.value, this.value, outputBuffer);

		for (const field of this.fields) {
			cursor.enterField(brand(field.key));
			field.shape.encodeField(cursor, cache, outputBuffer);
			cursor.exitField();
		}

		const localBuffer: BufferFormat<EncodedChunkShape> = [];

		forEachField(cursor, () => {
			const key = cursor.getFieldKey();
			if (!this.explicitKeys.has(key)) {
				assert(
					this.extraLocal !== undefined,
					0x742 /* had extra local fields when shape does not support them */,
				);
				localBuffer.push(new IdentifierToken(key));
				this.extraLocal.encodeField(cursor, cache, localBuffer);
			}
		});

		if (this.extraLocal !== undefined) {
			outputBuffer.push(localBuffer);
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
				fields: encodeFieldShapes(this.fields, identifiers, shapes),
				extraFields: encodeOptionalFieldShape(this.extraLocal, shapes),
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

		for (const field of this.fields) {
			identifiers.add(field.key);
			shapes(field.shape.shape);
		}

		if (this.extraLocal !== undefined) {
			shapes(this.extraLocal.shape);
		}
	}

	public get shape() {
		return this;
	}
}

export function encodeFieldShapes(
	fields: readonly KeyedFieldEncoder[],
	identifiers: DeduplicationTable<string>,
	shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
): EncodedFieldShape[] {
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

function encodeOptionalFieldShape(
	shape: FieldEncoder | undefined,
	shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
) {
	return shape === undefined ? undefined : dedupShape(shape.shape, shapes);
}

function dedupShape(
	shape: Shape<EncodedChunkShape>,
	shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
) {
	return shapes.valueToIndex.get(shape) ?? fail("missing shape");
}
