/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	AllowedTypes,
	FieldKinds,
	FieldSchema,
	SchemaBuilderInternal,
} from "../../feature-libraries";
import { requireAssignableTo } from "../../util";
import { leaf } from "../leafDomain";

const builder = new SchemaBuilderInternal({
	scope: "com.fluidframework.json",
	libraries: [leaf.library],
});

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
export const jsonNull = builder.struct("null", {});

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
	"object",
	FieldSchema.createUnsafe(FieldKinds.optional, jsonRoot),
);

/**
 * @alpha
 */
export const jsonArray = builder.fieldNodeRecursive(
	"array",
	FieldSchema.createUnsafe(FieldKinds.sequence, jsonRoot),
);

/**
 * @alpha
 */
export const jsonSchema = builder.finalize();
