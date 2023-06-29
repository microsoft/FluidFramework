/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import {
	FieldStoredSchema,
	GlobalFieldKey,
	ITreeCursorSynchronous,
	LocalFieldKey,
	SchemaDataAndPolicy,
	TreeSchemaIdentifier,
	ValueSchema,
	lookupGlobalFieldSchema,
} from "../../../core";
import { FullSchemaPolicy, Multiplicity } from "../../modular-schema";
import { fail } from "../../../util";
import { FieldKinds } from "../../defaultFieldKinds";
import { getFieldKind } from "../../contextuallyTyped";
import { EncodedChunk, EncodedValueShape } from "./format";
import {
	EncoderCache,
	FieldEncoder,
	KeyedFieldEncoder,
	FieldShaper,
	TreeShaper,
	anyFieldEncoder,
	anyNodeEncoder,
	asFieldEncoder,
	compressedEncode,
} from "./compressedEncode";
import { NodeShape } from "./nodeShape";

/**
 * Encode data from `cursor` in into an `EncodedChunk`.
 *
 * Optimized for encoded size and encoding performance.
 */
export function schemaCompressedEncode(
	schema: SchemaDataAndPolicy<FullSchemaPolicy>,
	cursor: ITreeCursorSynchronous,
): EncodedChunk {
	return compressedEncode(cursor, buildCache(schema));
}

export function buildCache(schema: SchemaDataAndPolicy<FullSchemaPolicy>): EncoderCache {
	const cache: EncoderCache = new EncoderCache(
		(fieldHandler: FieldShaper, schemaName: TreeSchemaIdentifier) =>
			treeShaper(schema, fieldHandler, schemaName),
		(treeHandler: TreeShaper, field: FieldStoredSchema) =>
			fieldShaper(treeHandler, field, cache),
	);
	return cache;
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
	fullSchema: SchemaDataAndPolicy<FullSchemaPolicy>,
	fieldHandler: FieldShaper,
	schemaName: TreeSchemaIdentifier,
): NodeShape {
	const schema = fullSchema.treeSchema.get(schemaName) ?? fail("missing schema");

	// TODO:Performance:
	// consider moving some optional and sequence fields to extra fields if they are commonly empty
	// to reduce encoded size.

	const local: KeyedFieldEncoder<LocalFieldKey>[] = [];
	for (const [key, field] of schema.localFields) {
		local.push({ key, shape: fieldHandler.shapeFromField(field) });
	}

	const global: KeyedFieldEncoder<GlobalFieldKey>[] = [];
	for (const key of schema.globalFields) {
		const field = lookupGlobalFieldSchema(fullSchema, key);
		global.push({ key, shape: fieldHandler.shapeFromField(field) });
	}

	const shape = new NodeShape(
		schemaName,
		valueShapeFromSchema(schema.value),
		local,
		global,
		schema.extraLocalFields.kind.identifier === FieldKinds.forbidden.identifier
			? undefined
			: fieldHandler.shapeFromField(schema.extraLocalFields),
		schema.extraGlobalFields ? anyFieldEncoder : undefined,
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
