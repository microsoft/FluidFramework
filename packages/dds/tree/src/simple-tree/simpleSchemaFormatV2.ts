/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * This file contains version 2 of the format for serializing the compatibility impacting subset of simple schema.
 *
 * Unlike version 1, object fields are keyed by their stored keys. Property keys are view-schema metadata and do not
 * impact persisted schema compatibility.
 */

import * as Type from "@sinclair/typebox";
import type { ObjectOptions, Static } from "@sinclair/typebox";

import * as V1 from "./simpleSchemaFormatV1.js";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

/**
 * The format version for the schema.
 */
export const SimpleSchemaFormatVersion = {
	v2: 2,
} as const;

export const SimpleAllowedTypesFormat = V1.SimpleAllowedTypesFormat;
export type SimpleAllowedTypesFormat = V1.SimpleAllowedTypesFormat;

export const SimpleFieldSchemaFormat = V1.SimpleFieldSchemaFormat;
export type SimpleFieldSchemaFormat = V1.SimpleFieldSchemaFormat;

export const SimpleArrayNodeSchemaFormat = V1.SimpleArrayNodeSchemaFormat;
export type SimpleArrayNodeSchemaFormat = V1.SimpleArrayNodeSchemaFormat;

export const SimpleMapNodeSchemaFormat = V1.SimpleMapNodeSchemaFormat;
export type SimpleMapNodeSchemaFormat = V1.SimpleMapNodeSchemaFormat;

export const SimpleRecordNodeSchemaFormat = V1.SimpleRecordNodeSchemaFormat;
export type SimpleRecordNodeSchemaFormat = V1.SimpleRecordNodeSchemaFormat;

export const SimpleLeafNodeSchemaFormat = V1.SimpleLeafNodeSchemaFormat;
export type SimpleLeafNodeSchemaFormat = V1.SimpleLeafNodeSchemaFormat;

/**
 * Persisted format for the field schemas of an object node, keyed by stored key.
 */
export const SimpleObjectFieldSchemasFormat = Type.Record(
	Type.String(),
	SimpleFieldSchemaFormat,
);
export type SimpleObjectFieldSchemasFormat = Static<typeof SimpleObjectFieldSchemasFormat>;

/**
 * Persisted format for an object node schema.
 */
export const SimpleObjectNodeSchemaFormat = Type.Object(
	{
		kind: Type.Integer(),
		fields: SimpleObjectFieldSchemasFormat,
		allowUnknownOptionalFields: Type.Optional(Type.Boolean()),
	},
	noAdditionalProps,
);
export type SimpleObjectNodeSchemaFormat = Static<typeof SimpleObjectNodeSchemaFormat>;

/**
 * Discriminated union of all possible node schemas.
 */
export const SimpleNodeSchemaUnionFormat = Type.Object({
	array: Type.Optional(SimpleArrayNodeSchemaFormat),
	map: Type.Optional(SimpleMapNodeSchemaFormat),
	record: Type.Optional(SimpleRecordNodeSchemaFormat),
	leaf: Type.Optional(SimpleLeafNodeSchemaFormat),
	object: Type.Optional(SimpleObjectNodeSchemaFormat),
});
export type SimpleNodeSchemaUnionFormat = Static<typeof SimpleNodeSchemaUnionFormat>;

/**
 * Helper type for the schema definitions map in the persisted format.
 */
export const SimpleSchemaDefinitionsFormat = Type.Record(
	Type.String(),
	SimpleNodeSchemaUnionFormat,
);
export type SimpleSchemaDefinitionsFormat = Static<typeof SimpleSchemaDefinitionsFormat>;

/**
 * Persisted format for the compatibility impacting subset of simple schema.
 */
export const SimpleTreeSchemaFormat = Type.Object(
	{
		version: Type.Literal(SimpleSchemaFormatVersion.v2),
		root: SimpleFieldSchemaFormat,
		definitions: SimpleSchemaDefinitionsFormat,
	},
	noAdditionalProps,
);
export type SimpleTreeSchemaFormat = Static<typeof SimpleTreeSchemaFormat>;
