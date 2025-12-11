/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * This file contains a format for serializing the compatibility impacting subset of simple schema.

 * This format can be used for both view and stored simple schema.
 * This only includes all parts of the schema that impact compatibility according to SchemaCompatibilityTester.
 * It may not include some details which impact maintenance of application enforced invariants (like persisted metadata or logic in view schema).
 */

import { Type, type ObjectOptions, type Static } from "@sinclair/typebox";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

/**
 * The format version for the schema.
 */
export const SimpleSchemaFormatVersion = {
	v1: 1,
} as const;

/**
 * The allowed types and their attributes in the simple schema format.
 * @see {@link SimpleAllowedTypes}.
 */
export const SimpleAllowedTypeAttributesFormat = Type.Object(
	{
		isStaged: Type.Optional(Type.Boolean()),
	},
	noAdditionalProps,
);

export type SimpleAllowedTypeAttributesFormat = Static<
	typeof SimpleAllowedTypeAttributesFormat
>;

/**
 * A set of allowed types in the simple schema format.
 * The keys are the type identifiers, and the values are their attributes.
 */
export const SimpleAllowedTypesFormat = Type.Record(
	Type.String(),
	SimpleAllowedTypeAttributesFormat,
);
export type SimpleAllowedTypesFormat = Static<typeof SimpleAllowedTypesFormat>;

/**
 * Persisted format for a field schema in the simple schema format.
 * @see {@link SimpleFieldSchema}.
 */
export const SimpleFieldSchemaFormat = Type.Object(
	{
		kind: Type.Integer(),
		simpleAllowedTypes: SimpleAllowedTypesFormat,
	},
	noAdditionalProps,
);
export type SimpleFieldSchemaFormat = Static<typeof SimpleFieldSchemaFormat>;

/**
 * Persisted format for an object field schema in the simple schema format.
 * @see {@link SimpleObjectFieldSchema}.
 */
export const SimpleObjectFieldSchemaFormat = Type.Object(
	{
		kind: Type.Integer(),
		simpleAllowedTypes: SimpleAllowedTypesFormat,
		storedKey: Type.String(),
	},
	noAdditionalProps,
);
export type SimpleObjectFieldSchemaFormat = Static<typeof SimpleObjectFieldSchemaFormat>;

/**
 * Persisted format for an array node schema in the simple schema format.
 * @see {@link SimpleArrayNodeSchema}.
 */
export const SimpleArrayNodeSchemaFormat = Type.Object(
	{
		kind: Type.Integer(),
		simpleAllowedTypes: SimpleAllowedTypesFormat,
	},
	noAdditionalProps,
);
export type SimpleArrayNodeSchemaFormat = Static<typeof SimpleArrayNodeSchemaFormat>;

/**
 * Persisted format for a map node schema in the simple schema format.
 * @see {@link SimpleMapNodeSchema}.
 */
export const SimpleMapNodeSchemaFormat = Type.Object(
	{
		kind: Type.Integer(),
		simpleAllowedTypes: SimpleAllowedTypesFormat,
	},
	noAdditionalProps,
);
export type SimpleMapNodeSchemaFormat = Static<typeof SimpleMapNodeSchemaFormat>;

/**
 * Persisted format for a record node schema in the simple schema format.
 * @see {@link SimpleRecordNodeSchema}.
 */
export const SimpleRecordNodeSchemaFormat = Type.Object(
	{
		kind: Type.Integer(),
		simpleAllowedTypes: SimpleAllowedTypesFormat,
	},
	noAdditionalProps,
);
export type SimpleRecordNodeSchemaFormat = Static<typeof SimpleRecordNodeSchemaFormat>;

/**
 * Persisted format for a leaf node schema in the simple schema format.
 * @see {@link SimpleLeafNodeSchema}.
 */
export const SimpleLeafNodeSchemaFormat = Type.Object(
	{
		kind: Type.Integer(),
		leafKind: Type.Integer(),
	},
	noAdditionalProps,
);
export type SimpleLeafNodeSchemaFormat = Static<typeof SimpleLeafNodeSchemaFormat>;

/**
 * Persisted format for the field schemas of an object node in the simple schema format.
 */
export const SimpleObjectFieldSchemasFormat = Type.Record(
	Type.String(),
	SimpleObjectFieldSchemaFormat,
);
export type SimpleObjectFieldSchemasFormat = Static<typeof SimpleObjectFieldSchemasFormat>;

/**
 * Persisted format for an object node schema in the simple schema format.
 * @see {@link SimpleObjectNodeSchema}.
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
 *
 * See {@link DiscriminatedUnionDispatcher} for more information on this pattern.
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
 * @see {@link SimpleTreeSchema}.
 */
export const SimpleTreeSchemaFormat = Type.Object(
	{
		version: Type.Literal(SimpleSchemaFormatVersion.v1),
		root: SimpleFieldSchemaFormat,
		definitions: SimpleSchemaDefinitionsFormat,
	},
	noAdditionalProps,
);
export type SimpleTreeSchemaFormat = Static<typeof SimpleTreeSchemaFormat>;
