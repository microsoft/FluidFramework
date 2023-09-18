/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AllowedTypes, FieldKinds, SchemaBuilder } from "../../feature-libraries";
import { ValueSchema } from "../../core";
import { requireAssignableTo } from "../../util";

const builder = new SchemaBuilder("Json Domain");

/**
 * @public
 */
export const jsonNumber = builder.leaf("Json.Number", ValueSchema.Number);

/**
 * @public
 */
export const jsonString = builder.leaf("Json.String", ValueSchema.String);

/**
 * @public
 */
export const jsonNull = builder.struct("Json.Null", {});

/**
 * @public
 */
export const jsonBoolean = builder.leaf("Json.Boolean", ValueSchema.Boolean);

const jsonPrimitives = [jsonNumber, jsonString, jsonNull, jsonBoolean] as const;

/**
 * Types allowed as roots of Json content.
 * @public
 */
export const jsonRoot = [() => jsonObject, () => jsonArray, ...jsonPrimitives] as const;

{
	// Recursive objects don't get this type checking automatically, so confirm it
	type _check = requireAssignableTo<typeof jsonRoot, AllowedTypes>;
}

/**
 * @public
 */
export const jsonObject = builder.mapRecursive(
	"Json.Object",
	SchemaBuilder.fieldRecursive(FieldKinds.optional, ...jsonRoot),
);

/**
 * @public
 */
export const jsonArray = builder.fieldNodeRecursive(
	"Json.Array",
	SchemaBuilder.fieldRecursive(FieldKinds.sequence, ...jsonRoot),
);

/**
 * @public
 */
export const jsonSchema = builder.intoLibrary();
