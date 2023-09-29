/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AllowedTypes, FieldKinds, SchemaBuilder } from "../../feature-libraries";
import { requireAssignableTo } from "../../util";
import * as leaf from "../leafDomain";

const builder = new SchemaBuilder("Json Domain", {}, leaf.library);

/**
 * @alpha
 * @deprecated Use leaf.number
 */
export const jsonNumber = leaf.number;

/**
 * @alpha
 * @deprecated Use leaf.string
 */
export const jsonString = leaf.string;

/**
 * @alpha
 */
export const jsonNull = builder.struct("Json.Null", {});

/**
 * @alpha
 * @deprecated Use leaf.boolean
 */
export const jsonBoolean = leaf.boolean;

const jsonPrimitives = [...leaf.primitives, jsonNull] as const;

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
export const jsonObject = builder.mapRecursive(
	"Json.Object",
	SchemaBuilder.fieldRecursive(FieldKinds.optional, ...jsonRoot),
);

/**
 * @alpha
 */
export const jsonArray = builder.fieldNodeRecursive(
	"Json.Array",
	SchemaBuilder.fieldRecursive(FieldKinds.sequence, ...jsonRoot),
);

/**
 * @alpha
 */
export const jsonSchema = builder.intoLibrary();
