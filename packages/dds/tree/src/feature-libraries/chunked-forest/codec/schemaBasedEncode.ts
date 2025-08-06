/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase, fail } from "@fluidframework/core-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";

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
import type { FullSchemaPolicy } from "../../modular-schema/index.js";

import {
	EncoderContext,
	type FieldEncoder,
	type FieldEncodeBuilder,
	type KeyedFieldEncoder,
	type NodeEncodeBuilder,
	anyNodeEncoder,
	asFieldEncoder,
	compressedEncode,
} from "./compressedEncode.js";
import type { FieldBatch } from "./fieldBatch.js";
import { type EncodedFieldBatch, type EncodedValueShape, SpecialField } from "./format.js";
import { NodeShapeBasedEncoder } from "./nodeEncoder.js";

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
	return compressedEncode(fieldBatch, buildContext(schema, policy, idCompressor));
}

export function buildContext(
	storedSchema: StoredSchemaCollection,
	policy: FullSchemaPolicy,
	idCompressor: IIdCompressor,
): EncoderContext {
	const context: EncoderContext = new EncoderContext(
		(fieldBuilder: FieldEncodeBuilder, schemaName: TreeNodeSchemaIdentifier) =>
			getNodeEncoder(fieldBuilder, storedSchema, schemaName),
		(nodeBuilder: NodeEncodeBuilder, fieldSchema: TreeFieldStoredSchema) =>
			getFieldEncoder(nodeBuilder, fieldSchema, context, storedSchema),
		policy.fieldKinds,
		idCompressor,
	);
	return context;
}

/**
 * Selects an encoder to use to encode fields.
 */
export function getFieldEncoder(
	nodeBuilder: NodeEncodeBuilder,
	field: TreeFieldStoredSchema,
	context: EncoderContext,
	storedSchema: StoredSchemaCollection,
): FieldEncoder {
	const kind = context.fieldShapes.get(field.kind) ?? fail(0xb52 /* missing FieldKind */);
	const type = oneFromSet(field.types);
	const nodeEncoder =
		type !== undefined ? nodeBuilder.nodeEncoderFromSchema(type) : anyNodeEncoder;
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
			const identifierNodeEncoder = new NodeShapeBasedEncoder(
				type,
				SpecialField.Identifier,
				[],
				undefined,
			);
			return asFieldEncoder(identifierNodeEncoder);
		}
		return asFieldEncoder(nodeEncoder);
	} else {
		return context.nestedArrayEncoder(nodeEncoder);
	}
}

/**
 * Selects an encoder to use to encode nodes.
 */
export function getNodeEncoder(
	fieldBuilder: FieldEncodeBuilder,
	storedSchema: StoredSchemaCollection,
	schemaName: TreeNodeSchemaIdentifier,
): NodeShapeBasedEncoder {
	const schema =
		storedSchema.nodeSchema.get(schemaName) ?? fail(0xb53 /* missing node schema */);

	if (schema instanceof ObjectNodeStoredSchema) {
		// TODO:Performance:
		// consider moving some optional and sequence fields to extra fields if they are commonly empty
		// to reduce encoded size.

		const objectNodeFields: KeyedFieldEncoder[] = [];
		for (const [key, field] of schema.objectNodeFields ?? []) {
			objectNodeFields.push({ key, encoder: fieldBuilder.fieldEncoderFromSchema(field) });
		}

		const shape = new NodeShapeBasedEncoder(schemaName, false, objectNodeFields, undefined);
		return shape;
	}
	if (schema instanceof LeafNodeStoredSchema) {
		const shape = new NodeShapeBasedEncoder(
			schemaName,
			valueShapeFromSchema(schema.leafValue),
			[],
			undefined,
		);
		return shape;
	}
	if (schema instanceof MapNodeStoredSchema) {
		const shape = new NodeShapeBasedEncoder(
			schemaName,
			false,
			[],
			fieldBuilder.fieldEncoderFromSchema(schema.mapFields),
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
