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

const jsonPrimitives = [...leaf.primitives, leaf.null] as const;

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
