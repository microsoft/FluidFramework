/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import {
	CursorLocationType,
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
import { BufferFormat } from "./chunkEncodingGeneric";
import { EncodedChunk, EncodedChunkShape, EncodedValueShape } from "./format";
import {
	EncoderCache,
	FieldEncoderShape,
	FieldShape,
	FieldShaper,
	NodeEncoderShape,
	TreeShaper,
	anyFieldEncoder,
	anyNodeEncoder,
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
	const cache = new EncoderCache(
		(fieldHandler: FieldShaper, schemaName: TreeSchemaIdentifier) =>
			treeShaper(schema, fieldHandler, schemaName),
		fieldShaper,
	);
	return compressedEncode(cursor, cache);
}

/**
 * Selects shapes to use to encode fields.
 */
export function fieldShaper(treeHandler: TreeShaper, field: FieldStoredSchema): FieldEncoderShape {
	const kind = getFieldKind(field);
	const type = oneFromSet(field.types);
	// eslint-disable-next-line unicorn/prefer-ternary
	if (kind.multiplicity === Multiplicity.Value) {
		return asFieldEncoder(
			type !== undefined ? treeHandler.shapeFromTree(type) : anyNodeEncoder,
		);
	} else {
		return anyFieldEncoder;
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

	const local: FieldShape<LocalFieldKey>[] = [];
	for (const [key, field] of schema.localFields) {
		local.push({ key, shape: fieldHandler.shapeFromField(field) });
	}

	const global: FieldShape<GlobalFieldKey>[] = [];
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
		schema.extraGlobalFields ? undefined : anyFieldEncoder,
	);
	return shape;
}

function oneFromSet<T>(set: ReadonlySet<T> | undefined): T | undefined {
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

function asFieldEncoder(encoder: NodeEncoderShape): FieldEncoderShape {
	return {
		encodeField(
			cursor: ITreeCursorSynchronous,
			shapes: EncoderCache,
			outputBuffer: BufferFormat<EncodedChunkShape>,
		): void {
			assert(cursor.mode === CursorLocationType.Fields, "unexpected mode");
			cursor.firstNode();
			encoder.encodeNodes(cursor, shapes, outputBuffer);
			assert(cursor.mode === CursorLocationType.Fields, "unexpected mode");
		},
		shape: encoder.shape,
	};
}
