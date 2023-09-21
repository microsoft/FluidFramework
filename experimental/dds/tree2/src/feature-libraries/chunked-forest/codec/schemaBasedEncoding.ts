/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import {
	FieldStoredSchema,
	ITreeCursorSynchronous,
	SchemaData,
	TreeSchemaIdentifier,
	ValueSchema,
} from "../../../core";
import { FieldKind, FullSchemaPolicy, Multiplicity } from "../../modular-schema";
import { fail } from "../../../util";
import { fieldKinds } from "../../default-field-kinds";
import { ICodecOptions, IJsonCodec } from "../../../codec";
import { EncodedChunk, EncodedValueShape, Versioned, validVersions } from "./format";
import {
	EncoderCache,
	FieldEncoder,
	KeyedFieldEncoder,
	FieldShaper,
	TreeShaper,
	anyNodeEncoder,
	asFieldEncoder,
	compressedEncode,
} from "./compressedEncode";
import { NodeShape } from "./nodeShape";
import { decode } from "./chunkDecoding";

/**
 * Encode data from `cursor` in into an `EncodedChunk`.
 *
 * Optimized for encoded size and encoding performance.
 */
export function schemaCompressedEncode(
	schema: SchemaData,
	policy: FullSchemaPolicy,
	cursor: ITreeCursorSynchronous,
): EncodedChunk {
	return compressedEncode(cursor, buildCache(schema, policy));
}

export function buildCache(schema: SchemaData, policy: FullSchemaPolicy): EncoderCache {
	const cache: EncoderCache = new EncoderCache(
		(fieldHandler: FieldShaper, schemaName: TreeSchemaIdentifier) =>
			treeShaper(schema, policy, fieldHandler, schemaName),
		(treeHandler: TreeShaper, field: FieldStoredSchema) =>
			fieldShaper(treeHandler, field, cache),
	);
	return cache;
}

export function getFieldKind(fieldSchema: FieldStoredSchema): FieldKind {
	// TODO:
	// This module currently is assuming use of defaultFieldKinds.
	// The field kinds should instead come from a view schema registry thats provided somewhere.
	return fieldKinds.get(fieldSchema.kind.identifier) ?? fail("missing field kind");
}

/**
 * Selects shapes to use to encode fields.
 */
export function fieldShaper(
	treeHandler: TreeShaper,
	field: FieldStoredSchema,
	cache: EncoderCache,
): FieldEncoder {
	const kind = getFieldKind(field);
	const type = oneFromSet(field.types);
	const nodeEncoder = type !== undefined ? treeHandler.shapeFromTree(type) : anyNodeEncoder;
	// eslint-disable-next-line unicorn/prefer-ternary
	if (kind.multiplicity === Multiplicity.Value) {
		return asFieldEncoder(nodeEncoder);
	} else {
		return cache.nestedArray(nodeEncoder);
	}
}

/**
 * Selects shapes to use to encode trees.
 */
export function treeShaper(
	fullSchema: SchemaData,
	policy: FullSchemaPolicy,
	fieldHandler: FieldShaper,
	schemaName: TreeSchemaIdentifier,
): NodeShape {
	const schema = fullSchema.treeSchema.get(schemaName) ?? fail("missing schema");

	// TODO:Performance:
	// consider moving some optional and sequence fields to extra fields if they are commonly empty
	// to reduce encoded size.

	const structFields: KeyedFieldEncoder[] = [];
	for (const [key, field] of schema.structFields ?? []) {
		structFields.push({ key, shape: fieldHandler.shapeFromField(field) });
	}

	const shape = new NodeShape(
		schemaName,
		valueShapeFromSchema(schema.leafValue),
		structFields,
		schema.mapFields === undefined ? undefined : fieldHandler.shapeFromField(schema.mapFields),
	);
	return shape;
}

export function oneFromSet<T>(set: ReadonlySet<T> | undefined): T | undefined {
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

function valueShapeFromSchema(schema: ValueSchema | undefined): undefined | EncodedValueShape {
	switch (schema) {
		case undefined:
			return false;
		case ValueSchema.Number:
		case ValueSchema.String:
		case ValueSchema.Boolean:
		case ValueSchema.FluidHandle:
			return true;
		default:
			unreachableCase(schema);
	}
}

export function makeSchemaCompressedCodec(
	{ jsonValidator: validator }: ICodecOptions,
	schema: SchemaData,
	policy: FullSchemaPolicy,
): IJsonCodec<ITreeCursorSynchronous, string> {
	const versionedValidator = validator.compile(Versioned);
	const formatValidator = validator.compile(EncodedChunk);
	return {
		encode: (data: ITreeCursorSynchronous) => {
			const encoded = schemaCompressedEncode(schema, policy, data);
			assert(versionedValidator.check(encoded), "Encoded schema should be versioned");
			assert(formatValidator.check(encoded), "Encoded schema should validate");
			return JSON.stringify(encoded);
		},
		decode: (data: string): ITreeCursorSynchronous => {
			const parsed = JSON.parse(data);
			if (!versionedValidator.check(parsed)) {
				fail("invalid serialized schema: did not have a version");
			}
			if (!formatValidator.check(parsed)) {
				if (validVersions.has(parsed.version)) {
					fail("Unexpected version for schema");
				}
				fail("Serialized schema failed validation");
			}
			return decode(parsed).cursor();
		},
	};
}
