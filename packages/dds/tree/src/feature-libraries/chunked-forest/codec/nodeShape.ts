/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	type FieldKey,
	type ITreeCursorSynchronous,
	type TreeNodeSchemaIdentifier,
	forEachField,
	type Value,
} from "../../../core/index.js";
import { brand, fail } from "../../../util/index.js";

import type { Counter, DeduplicationTable } from "./chunkCodecUtilities.js";
import { type BufferFormat, IdentifierToken, Shape } from "./chunkEncodingGeneric.js";
import {
	type EncoderCache,
	type FieldEncoder,
	type KeyedFieldEncoder,
	type NodeEncoder,
	encodeValue,
} from "./compressedEncode.js";
import type { EncodedChunkShape, EncodedFieldShape, EncodedValueShape } from "./format.js";
import { isStableId } from "@fluidframework/id-compressor/internal";

export class NodeShape extends Shape<EncodedChunkShape> implements NodeEncoder {
	// TODO: Ensure uniform chunks, encoding and identifier generation sort fields the same.
	private readonly explicitKeys: Set<FieldKey>;

	public constructor(
		public readonly type: undefined | TreeNodeSchemaIdentifier,
		public readonly value: EncodedValueShape,
		public readonly fields: readonly KeyedFieldEncoder[],
		public readonly extraLocal: undefined | FieldEncoder,
	) {
		super();
		this.explicitKeys = new Set(this.fields.map((f) => f.key));
	}

	private getValueToEncode(cursor: ITreeCursorSynchronous, cache: EncoderCache): Value {
		if (this.value === 0) {
			assert(typeof cursor.value === "string", 0x9aa /* identifier must be type string */);
			if (isStableId(cursor.value)) {
				// We ensure here that if the value is a compressible id, the compressed OpSpaceCompressedId is returned.
				// This will be casted to a number when json serialized, but will be safe to cast back to OpSpaceCompressedId during decoding.
				const sessionSpaceCompressedId = cache.idCompressor.tryRecompress(cursor.value);
				if (sessionSpaceCompressedId !== undefined) {
					return cache.idCompressor.normalizeToOpSpace(sessionSpaceCompressedId);
				}
			}
		}
		return cursor.value;
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
		encodeValue(this.getValueToEncode(cursor, cache), this.value, outputBuffer);
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

	public get shape(): NodeShape {
		return this;
	}
}

export function encodeFieldShapes(
	fields: readonly KeyedFieldEncoder[],
	identifiers: DeduplicationTable<string>,
	shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
): EncodedFieldShape[] | undefined {
	if (fields.length === 0) {
		return undefined;
	}
	return fields.map((field) => [
		// key
		encodeIdentifier(field.key, identifiers),
		// shape
		shapes.valueToIndex.get(field.shape.shape) ?? fail(0xb50 /* missing shape */),
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
	shape: FieldEncoder | undefined,
	shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
): number | undefined {
	return shape === undefined ? undefined : dedupShape(shape.shape, shapes);
}

function dedupShape(
	shape: Shape<EncodedChunkShape>,
	shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
): number {
	return shapes.valueToIndex.get(shape) ?? fail(0xb51 /* missing shape */);
}
