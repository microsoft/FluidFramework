/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AllowedTypes, FieldKinds, SchemaBuilder } from "../../feature-libraries";
import { ValueSchema, EmptyKey } from "../../core";
import { requireAssignableTo } from "../../util";

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
 * @alpha
 */
export const jsonRoot = [() => jsonObject, () => jsonArray, ...jsonPrimitives] as const;

{
	// Recursive objects don't get this type checking automatically, so confirm it
	type _check = requireAssignableTo<typeof jsonRoot, AllowedTypes>;
}

/**
 * @alpha
 */
export const jsonObject = builder.objectRecursive("Json.Object", {
	extraLocalFields: SchemaBuilder.fieldRecursive(FieldKinds.optional, ...jsonRoot),
});

/**
 * @alpha
 */
export const jsonArray = builder.objectRecursive("Json.Array", {
	local: {
		[EmptyKey]: SchemaBuilder.fieldRecursive(FieldKinds.sequence, ...jsonRoot),
	},
});

/**
 * @alpha
 */
export const jsonSchema = builder.intoLibrary();
