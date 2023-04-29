/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaBuilder, TreeSchema, AllowedTypes } from "../../feature-libraries";
import { ValueSchema, EmptyKey } from "../../core";

const builder = new SchemaBuilder("Json Domain");

/**
 * @alpha
 */
export const jsonNumber = builder.primitive("Json.Number", ValueSchema.Number);

/**
 * @alpha
 */
export const jsonString = builder.primitive("Json.String", ValueSchema.String);

/**
 * @alpha
 */
export const jsonNull = builder.object("Json.Null", {});

/**
 * @alpha
 */
export const jsonBoolean = builder.primitive("Json.Boolean", ValueSchema.Boolean);

const jsonPrimitives = [jsonNumber, jsonString, jsonNull, jsonBoolean] as const;

/**
 * Types allowed as roots of Json content.
 * Since the Json domain is recursive, this set is declared,
 * then used in the schema, then populated below.
 */
const jsonTypes = [() => jsonObject, () => jsonArray, ...jsonPrimitives] as const;

/**
 * @alpha
 */
export const jsonObject = builder.object("Json.Object", {
	extraLocalFields: SchemaBuilder.optional([
		// TODO: make recursive strong typing work.
		(): TreeSchema => jsonObject,
		() => jsonArray,
		...jsonPrimitives,
	] as const),
});

/**
 * @alpha
 */
export const jsonArray = builder.object("Json.Array", {
	local: {
		[EmptyKey]: SchemaBuilder.sequence([
			// TODO: make recursive strong typing work.
			(): TreeSchema => jsonObject,
			(): TreeSchema => jsonArray,
			...jsonPrimitives,
		] as const),
	},
});

/**
 * @alpha
 */
export const jsonSchema = builder.intoLibrary();

/**
 * @alpha
 */
export const jsonRoot: AllowedTypes = jsonTypes;
