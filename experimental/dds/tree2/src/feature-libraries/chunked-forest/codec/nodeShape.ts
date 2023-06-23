/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	FieldKey,
	GlobalFieldKey,
	ITreeCursorSynchronous,
	LocalFieldKey,
	TreeSchemaIdentifier,
	forEachField,
	isGlobalFieldKey,
	keyFromSymbol,
	symbolFromKey,
} from "../../../core";
import { brand, fail } from "../../../util";
import { BufferFormat, IdentifierToken, Shape } from "./chunkEncodingGeneric";
import { Counter, DeduplicationTable } from "./chunkCodecUtilities";
import { EncodedChunkShape, EncodedFieldShape, EncodedValueShape } from "./format";
import {
	NodeEncoderShape,
	FieldShape,
	FieldEncoderShape,
	EncoderCache,
	encodeValue,
} from "./compressedEncode";

export class NodeShape extends Shape<EncodedChunkShape> implements NodeEncoderShape {
	// TODO: Ensure uniform chunks, encoding and identifier generation sort fields the same.
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

	public encodeNode(
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
					globalBuffer.push(new IdentifierToken(keyFromSymbol(key)));
					this.extraGlobal.encodeField(cursor, cache, globalBuffer);
				} else {
					assert(
						this.extraLocal !== undefined,
						"had extra local fields when shape does not support them",
					);
					localBuffer.push(new IdentifierToken(key));
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

export function encodeFieldShapes(
	fields: readonly FieldShape<string>[],
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
	shape: FieldEncoderShape | undefined,
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
