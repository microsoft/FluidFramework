import { Type, type ObjectOptions, type Static } from "@sinclair/typebox";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

/**
 * The format version for the schema.
 */
export const SimpleSchemaFormatVersion = {
	v1: 1,
} as const;

export const SimpleAllowedTypeAttributesFormat = Type.Object(
	{
		isStaged: Type.Optional(Type.Boolean()),
	},
	noAdditionalProps,
);
export type SimpleAllowedTypeAttributesFormat = Static<
	typeof SimpleAllowedTypeAttributesFormat
>;
export const SimpleAllowedTypesFormat = Type.Record(
	Type.String(),
	SimpleAllowedTypeAttributesFormat,
);
export type SimpleAllowedTypesFormat = Static<typeof SimpleAllowedTypesFormat>;

export const SimpleFieldSchemaFormat = Type.Object(
	{
		kind: Type.Integer(),
		simpleAllowedTypes: SimpleAllowedTypesFormat,
	},
	noAdditionalProps,
);
export type SimpleFieldSchemaFormat = Static<typeof SimpleFieldSchemaFormat>;

// TODO: Extend SimpleFieldSchemaFormat
export const SimpleObjectFieldSchemaFormat = Type.Object(
	{
		kind: Type.Integer(),
		simpleAllowedTypes: SimpleAllowedTypesFormat,
		storedKey: Type.String(),
	},
	noAdditionalProps,
);
export type SimpleObjectFieldSchemaFormat = Static<typeof SimpleObjectFieldSchemaFormat>;

export const SimpleArrayNodeSchemaFormat = Type.Object(
	{
		kind: Type.Integer(),
		simpleAllowedTypes: SimpleAllowedTypesFormat,
	},
	noAdditionalProps,
);
export type SimpleArrayNodeSchemaFormat = Static<typeof SimpleArrayNodeSchemaFormat>;

export const SimpleMapNodeSchemaFormat = Type.Object(
	{
		kind: Type.Integer(),
		simpleAllowedTypes: SimpleAllowedTypesFormat,
	},
	noAdditionalProps,
);
export type SimpleMapNodeSchemaFormat = Static<typeof SimpleMapNodeSchemaFormat>;

export const SimpleRecordNodeSchemaFormat = Type.Object(
	{
		kind: Type.Integer(),
		simpleAllowedTypes: SimpleAllowedTypesFormat,
	},
	noAdditionalProps,
);
export type SimpleRecordNodeSchemaFormat = Static<typeof SimpleRecordNodeSchemaFormat>;

export const SimpleLeafNodeSchemaFormat = Type.Object(
	{
		kind: Type.Integer(),
		leafKind: Type.Integer(),
	},
	noAdditionalProps,
);
export type SimpleLeafNodeSchemaFormat = Static<typeof SimpleLeafNodeSchemaFormat>;

export const SimpleObjectFieldSchemasFormat = Type.Record(
	Type.String(),
	SimpleObjectFieldSchemaFormat,
);
export type SimpleObjectFieldSchemasFormat = Static<typeof SimpleObjectFieldSchemasFormat>;

export const SimpleObjectNodeSchemaFormat = Type.Object(
	{
		kind: Type.Integer(),
		fields: SimpleObjectFieldSchemasFormat,
		allowUnknownOptionalFields: Type.Optional(Type.Boolean()),
	},
	noAdditionalProps,
);
export type SimpleObjectNodeSchemaFormat = Static<typeof SimpleObjectNodeSchemaFormat>;

export const SimpleNodeSchemaUnionFormat = Type.Object({
	array: Type.Optional(SimpleArrayNodeSchemaFormat),
	map: Type.Optional(SimpleMapNodeSchemaFormat),
	record: Type.Optional(SimpleRecordNodeSchemaFormat),
	leaf: Type.Optional(SimpleLeafNodeSchemaFormat),
	object: Type.Optional(SimpleObjectNodeSchemaFormat),
});
export type SimpleNodeSchemaUnionFormat = Static<typeof SimpleNodeSchemaUnionFormat>;

export const SimpleSchemaDefinitionsFormat = Type.Record(
	Type.String(),
	SimpleNodeSchemaUnionFormat,
);
export type SimpleSchemaDefinitionsFormat = Static<typeof SimpleSchemaDefinitionsFormat>;

export const SimpleTreeSchemaFormat = Type.Object(
	{
		version: Type.Literal(SimpleSchemaFormatVersion.v1),
		root: SimpleFieldSchemaFormat,
		definitions: SimpleSchemaDefinitionsFormat,
	},
	noAdditionalProps,
);
export type SimpleTreeSchemaFormat = Static<typeof SimpleTreeSchemaFormat>;
