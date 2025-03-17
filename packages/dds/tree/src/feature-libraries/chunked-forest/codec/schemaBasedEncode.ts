/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import {
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	type StoredSchemaCollection,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	ValueSchema,
	Multiplicity,
	identifierFieldKindIdentifier,
} from "../../../core/index.js";
import { fail } from "../../../util/index.js";
import type { FullSchemaPolicy } from "../../modular-schema/index.js";

import {
	EncoderCache,
	type FieldEncoder,
	type FieldShaper,
	type KeyedFieldEncoder,
	type TreeShaper,
	anyNodeEncoder,
	asFieldEncoder,
	compressedEncode,
} from "./compressedEncode.js";
import type { FieldBatch } from "./fieldBatch.js";
import { type EncodedFieldBatch, type EncodedValueShape, SpecialField } from "./format.js";
import { NodeShape } from "./nodeShape.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";

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
	idCompressor: IIdCompressor,
): EncodedFieldBatch {
	return compressedEncode(fieldBatch, buildCache(schema, policy, idCompressor));
}

export function buildCache(
	schema: StoredSchemaCollection,
	policy: FullSchemaPolicy,
	idCompressor: IIdCompressor,
): EncoderCache {
	const cache: EncoderCache = new EncoderCache(
		(fieldHandler: FieldShaper, schemaName: TreeNodeSchemaIdentifier) =>
			treeShaper(schema, policy, fieldHandler, schemaName),
		(treeHandler: TreeShaper, field: TreeFieldStoredSchema) =>
			fieldShaper(treeHandler, field, cache, schema),
		policy.fieldKinds,
		idCompressor,
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
	storedSchema: StoredSchemaCollection,
): FieldEncoder {
	const kind = cache.fieldShapes.get(field.kind) ?? fail(0xb52 /* missing FieldKind */);
	const type = oneFromSet(field.types);
	const nodeEncoder = type !== undefined ? treeHandler.shapeFromTree(type) : anyNodeEncoder;
	if (kind.multiplicity === Multiplicity.Single) {
		if (field.kind === identifierFieldKindIdentifier) {
			assert(type !== undefined, 0x999 /* field type must be defined in identifier field */);
			const nodeSchema = storedSchema.nodeSchema.get(type);
			assert(nodeSchema !== undefined, 0x99a /* nodeSchema must be defined */);
			assert(
				nodeSchema instanceof LeafNodeStoredSchema,
				0x99b /* nodeSchema must be LeafNodeStoredSchema */,
			);
			assert(
				nodeSchema.leafValue === ValueSchema.String,
				0x99c /* identifier field can only be type string */,
			);
			const identifierNodeEncoder = new NodeShape(
				type,
				SpecialField.Identifier,
				[],
				undefined,
			);
			return asFieldEncoder(identifierNodeEncoder);
		}
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
	const schema =
		fullSchema.nodeSchema.get(schemaName) ?? fail(0xb53 /* missing node schema */);

	if (schema instanceof ObjectNodeStoredSchema) {
		// TODO:Performance:
		// consider moving some optional and sequence fields to extra fields if they are commonly empty
		// to reduce encoded size.

		const objectNodeFields: KeyedFieldEncoder[] = [];
		for (const [key, field] of schema.objectNodeFields ?? []) {
			objectNodeFields.push({ key, shape: fieldHandler.shapeFromField(field) });
		}

		const shape = new NodeShape(schemaName, false, objectNodeFields, undefined);
		return shape;
	}
	if (schema instanceof LeafNodeStoredSchema) {
		const shape = new NodeShape(
			schemaName,
			valueShapeFromSchema(schema.leafValue),
			[],
			undefined,
		);
		return shape;
	}
	if (schema instanceof MapNodeStoredSchema) {
		const shape = new NodeShape(
			schemaName,
			false,
			[],
			fieldHandler.shapeFromField(schema.mapFields),
		);
		return shape;
	}
	fail(0xb54 /* unsupported node kind */);
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
