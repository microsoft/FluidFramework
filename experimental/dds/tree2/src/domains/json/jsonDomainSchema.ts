/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Adding this unused import makes the generated d.ts file produced by TypeScript stop breaking API-Extractor's rollup generation.
// Without this import, TypeScript generates inline `import("../..")` statements in the d.ts file,
// which API-Extractor leaves as is when generating the rollup, leaving them pointing at the wrong directory.
// TODO: Understand and/or remove the need for this workaround.
// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports
import { ValueSchema } from "../../core";

import {
	AllowedTypes,
	FieldKinds,
	TreeFieldSchema,
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
	TreeFieldSchema.createUnsafe(FieldKinds.optional, jsonRoot),
);

/**
 * @alpha
 */
export const jsonArray = builder.fieldNodeRecursive(
	"array",
	TreeFieldSchema.createUnsafe(FieldKinds.sequence, jsonRoot),
);

/**
 * @alpha
 */
export const jsonSchema = builder.intoLibrary();
