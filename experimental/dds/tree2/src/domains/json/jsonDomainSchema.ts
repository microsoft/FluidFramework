/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaBuilder, TreeSchema } from "../../feature-libraries";
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
 * @alpha
 */
export const jsonObject = builder.object("Json.Object", {
	extraLocalFields: SchemaBuilder.optional(
		// TODO: make recursive strong typing work.
		(): TreeSchema => jsonObject,
		() => jsonArray,
		...jsonPrimitives,
	),
});

/**
 * @alpha
 */
export const jsonArray = builder.object("Json.Array", {
	local: {
		[EmptyKey]: SchemaBuilder.sequence(
			// TODO: make recursive strong typing work.
			(): TreeSchema => jsonObject,
			(): TreeSchema => jsonArray,
			...jsonPrimitives,
		),
	},
});

/**
 * @alpha
 */
export const jsonSchema = builder.intoLibrary();

/**
 * Types allowed as roots of Json content.
 * @alpha
 */
export const jsonRoot = [jsonObject, jsonArray, ...jsonPrimitives] as const;
