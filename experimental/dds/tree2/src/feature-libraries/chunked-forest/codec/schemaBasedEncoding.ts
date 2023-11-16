/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils";
import {
	TreeFieldStoredSchema,
	ITreeCursorSynchronous,
	StoredSchemaCollection,
	TreeNodeSchemaIdentifier,
	ValueSchema,
} from "../../../core";
import { FieldKind, FullSchemaPolicy, Multiplicity } from "../../modular-schema";
import { fail } from "../../../util";
import { fieldKinds } from "../../default-field-kinds";
import { EncodedChunk, EncodedValueShape } from "./format";
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

/**
 * Encode data from `cursor` in into an `EncodedChunk`.
 *
 * Optimized for encoded size and encoding performance.
 * TODO: This function should eventually also take in the root FieldSchema to more efficiently compress the nodes.
 */
export function schemaCompressedEncode(
	schema: StoredSchemaCollection,
	policy: FullSchemaPolicy,
	cursor: ITreeCursorSynchronous,
): EncodedChunk {
	return compressedEncode(cursor, buildCache(schema, policy));
}

export function buildCache(schema: StoredSchemaCollection, policy: FullSchemaPolicy): EncoderCache {
	const cache: EncoderCache = new EncoderCache(
		(fieldHandler: FieldShaper, schemaName: TreeNodeSchemaIdentifier) =>
			treeShaper(schema, policy, fieldHandler, schemaName),
		(treeHandler: TreeShaper, field: TreeFieldStoredSchema) =>
			fieldShaper(treeHandler, field, cache),
	);
	return cache;
}

export function getFieldKind(fieldSchema: TreeFieldStoredSchema): FieldKind {
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
	field: TreeFieldStoredSchema,
	cache: EncoderCache,
): FieldEncoder {
	const kind = getFieldKind(field);
	const type = oneFromSet(field.types);
	const nodeEncoder = type !== undefined ? treeHandler.shapeFromTree(type) : anyNodeEncoder;
	// eslint-disable-next-line unicorn/prefer-ternary
	if (kind.multiplicity === Multiplicity.Single) {
		return asFieldEncoder(nodeEncoder);
	} else {
		return cache.nestedArray(nodeEncoder);
	}
}

/**
 * Selects shapes to use to encode trees.
 */
export function treeShaper(
	fullSchema: StoredSchemaCollection,
	policy: FullSchemaPolicy,
	fieldHandler: FieldShaper,
	schemaName: TreeNodeSchemaIdentifier,
): NodeShape {
	const schema = fullSchema.nodeSchema.get(schemaName) ?? fail("missing schema");

	// TODO:Performance:
	// consider moving some optional and sequence fields to extra fields if they are commonly empty
	// to reduce encoded size.

	const objectNodeFields: KeyedFieldEncoder[] = [];
	for (const [key, field] of schema.objectNodeFields ?? []) {
		objectNodeFields.push({ key, shape: fieldHandler.shapeFromField(field) });
	}

	const shape = new NodeShape(
		schemaName,
		valueShapeFromSchema(schema.leafValue),
		objectNodeFields,
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
		case ValueSchema.Null:
			return [null];
		default:
			unreachableCase(schema);
	}
}
