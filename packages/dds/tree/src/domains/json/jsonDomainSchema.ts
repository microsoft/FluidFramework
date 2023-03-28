/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKinds, TypedSchema, SchemaAware } from "../../feature-libraries";
import { ValueSchema, FieldSchema, SchemaData, EmptyKey } from "../../core";

/**
 * Types allowed as roots of Json content.
 * Since the Json domain is recursive, this set is declared,
 * then used in the schema, then populated below.
 */
const jsonTypes = [
	"Json.Object",
	"Json.Array",
	"Json.Number",
	"Json.String",
	"Json.Null",
	"Json.Boolean",
] as const;

/**
 * @alpha
 */
export const jsonObject = TypedSchema.tree("Json.Object", {
	extraLocalFields: TypedSchema.field(FieldKinds.optional, ...jsonTypes),
});

/**
 * @alpha
 */
export const jsonArray = TypedSchema.tree("Json.Array", {
	local: { [EmptyKey]: TypedSchema.field(FieldKinds.sequence, ...jsonTypes) },
});

/**
 * @alpha
 */
export const jsonNumber = TypedSchema.tree("Json.Number", {
	value: ValueSchema.Number,
});

/**
 * @alpha
 */
export const jsonString = TypedSchema.tree("Json.String", {
	value: ValueSchema.String,
});

/**
 * @alpha
 */
export const jsonNull = TypedSchema.tree("Json.Null", {});

/**
 * @alpha
 */
export const jsonBoolean = TypedSchema.tree("Json.Boolean", {
	value: ValueSchema.Boolean,
});

/**
 * @alpha
 */
export const jsonSchemaData: SchemaData = SchemaAware.typedSchemaData(
	new Map(),
	jsonObject,
	jsonArray,
	jsonNumber,
	jsonString,
	jsonNull,
	jsonBoolean,
);

/**
 * @alpha
 */
export const jsonRoot: FieldSchema = TypedSchema.field(FieldKinds.value, ...jsonTypes);
