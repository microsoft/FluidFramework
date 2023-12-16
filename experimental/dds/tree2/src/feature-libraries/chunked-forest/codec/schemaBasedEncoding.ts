/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils";
import {
	TreeFieldStoredSchema,
	StoredSchemaCollection,
	TreeNodeSchemaIdentifier,
	ValueSchema,
} from "../../../core";
import { FullSchemaPolicy } from "../../modular-schema";
import { fail } from "../../../util";
import { Multiplicity } from "../../multiplicity";
import { EncodedFieldBatch, EncodedValueShape } from "./format";
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
import { FieldBatch } from "./fieldBatch";

/**
 * Encode data from `fieldBatch` in into an `EncodedChunk`.
 *
 * Optimized for encoded size and encoding performance.
 * TODO: This function should eventually also take in the root FieldSchema to more efficiently compress the nodes.
 */
export function schemaCompressedEncode(
	schema: StoredSchemaCollection,
	policy: FullSchemaPolicy,
	fieldBatch: FieldBatch,
): EncodedFieldBatch {
	return compressedEncode(fieldBatch, buildCache(schema, policy));
}

export function buildCache(schema: StoredSchemaCollection, policy: FullSchemaPolicy): EncoderCache {
	const cache: EncoderCache = new EncoderCache(
		(fieldHandler: FieldShaper, schemaName: TreeNodeSchemaIdentifier) =>
			treeShaper(schema, policy, fieldHandler, schemaName),
		(treeHandler: TreeShaper, field: TreeFieldStoredSchema) =>
			fieldShaper(treeHandler, field, cache),
		policy.fieldKinds,
	);
	return cache;
}

/**
 * Selects shapes to use to encode fields.
 */
export function fieldShaper(
	treeHandler: TreeShaper,
	field: TreeFieldStoredSchema,
	cache: EncoderCache,
): FieldEncoder {
	const kind = cache.fieldShapes.get(field.kind.identifier) ?? fail("missing FieldKind");
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
