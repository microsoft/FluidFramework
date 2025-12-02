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
	type SchemaPolicy,
} from "../../../core/index.js";

import {
	EncoderContext,
	type FieldEncoder,
	type FieldEncodeBuilder,
	type KeyedFieldEncoder,
	type NodeEncodeBuilder,
	anyNodeEncoder,
	asFieldEncoder,
	compressedEncode,
	incrementalFieldEncoder,
} from "./compressedEncode.js";
import type { FieldBatch } from "./fieldBatch.js";
import {
	type EncodedFieldBatch,
	type EncodedFieldBatchV1,
	type EncodedFieldBatchV2,
	type EncodedValueShape,
	FieldBatchFormatVersion,
	SpecialField,
} from "./format.js";
import type { IncrementalEncoder } from "./codecs.js";
import { NodeShapeBasedEncoder } from "./nodeEncoder.js";
import { defaultIncrementalEncodingPolicy } from "./incrementalEncodingPolicy.js";
import { brand, oneFromIterable } from "../../../util/index.js";

/**
 * Encode data from `fieldBatch` in into an `EncodedChunk` using {@link FieldBatchFormatVersion.v1}.
 * @remarks See {@link schemaCompressedEncode} for more details.
 * This version does not support incremental encoding.
 */
export function schemaCompressedEncodeV1(
	schema: StoredSchemaCollection,
	policy: SchemaPolicy,
	fieldBatch: FieldBatch,
	idCompressor: IIdCompressor,
): EncodedFieldBatchV1 {
	return schemaCompressedEncode(
		schema,
		policy,
		fieldBatch,
		idCompressor,
		undefined /* incrementalEncoder */,
		brand(FieldBatchFormatVersion.v1),
	);
}

/**
 * Encode data from `fieldBatch` in into an `EncodedChunk` using {@link FieldBatchFormatVersion.v2}.
 * @remarks See {@link schemaCompressedEncode} for more details.
 * Incremental encoding is supported from this version onwards.
 */
export function schemaCompressedEncodeV2(
	schema: StoredSchemaCollection,
	policy: SchemaPolicy,
	fieldBatch: FieldBatch,
	idCompressor: IIdCompressor,
	incrementalEncoder: IncrementalEncoder | undefined,
): EncodedFieldBatchV2 {
	return schemaCompressedEncode(
		schema,
		policy,
		fieldBatch,
		idCompressor,
		incrementalEncoder,
		brand(FieldBatchFormatVersion.v2),
	);
}

/**
 * Encode data from `fieldBatch` in into an `EncodedChunk`.
 * @remarks
 * If `incrementalEncoder` is provided,
 * fields that support incremental encoding will encode their chunks separately via the `incrementalEncoder`.
 * See {@link IncrementalEncoder} for more details.
 *
 * Optimized for encoded size and encoding performance.
 * TODO: This function should eventually also take in the root FieldSchema to more efficiently compress the nodes.
 */
function schemaCompressedEncode(
	schema: StoredSchemaCollection,
	policy: SchemaPolicy,
	fieldBatch: FieldBatch,
	idCompressor: IIdCompressor,
	incrementalEncoder: IncrementalEncoder | undefined,
	version: FieldBatchFormatVersion,
): EncodedFieldBatch {
	return compressedEncode(
		fieldBatch,
		buildContext(schema, policy, idCompressor, incrementalEncoder, version),
	);
}

export function buildContext(
	storedSchema: StoredSchemaCollection,
	policy: SchemaPolicy,
	idCompressor: IIdCompressor,
	incrementalEncoder: IncrementalEncoder | undefined,
	version: FieldBatchFormatVersion,
): EncoderContext {
	const context: EncoderContext = new EncoderContext(
		(fieldBuilder: FieldEncodeBuilder, schemaName: TreeNodeSchemaIdentifier) =>
			getNodeEncoder(fieldBuilder, storedSchema, schemaName, incrementalEncoder),
		(nodeBuilder: NodeEncodeBuilder, fieldSchema: TreeFieldStoredSchema) =>
			getFieldEncoder(nodeBuilder, fieldSchema, context, storedSchema),
		policy.fieldKinds,
		idCompressor,
		incrementalEncoder,
		version,
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
	const type = oneFromIterable(field.types);
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
	incrementalEncoder?: IncrementalEncoder,
): NodeShapeBasedEncoder {
	const shouldEncodeIncrementally =
		incrementalEncoder?.shouldEncodeIncrementally ?? defaultIncrementalEncodingPolicy;
	const schema =
		storedSchema.nodeSchema.get(schemaName) ?? fail(0xb53 /* missing node schema */);

	// This handles both object and array nodes.
	if (schema instanceof ObjectNodeStoredSchema) {
		// TODO:Performance:
		// consider moving some optional and sequence fields to extra fields if they are commonly empty
		// to reduce encoded size.
		const objectNodeFields: KeyedFieldEncoder[] = [];
		for (const [key, field] of schema.objectNodeFields ?? []) {
			const fieldEncoder = shouldEncodeIncrementally(schemaName, key)
				? incrementalFieldEncoder
				: fieldBuilder.fieldEncoderFromSchema(field);
			objectNodeFields.push({
				key,
				encoder: fieldEncoder,
			});
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

	// This handles both maps and record nodes.
	if (schema instanceof MapNodeStoredSchema) {
		const fieldEncoder = shouldEncodeIncrementally(schemaName)
			? incrementalFieldEncoder
			: fieldBuilder.fieldEncoderFromSchema(schema.mapFields);
		const shape = new NodeShapeBasedEncoder(schemaName, false, [], fieldEncoder);
		return shape;
	}
	fail(0xb54 /* unsupported node kind */);
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
