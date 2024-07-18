/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Adding this unused import makes the generated d.ts file produced by TypeScript stop breaking API-Extractor's rollup generation.
// Without this import, TypeScript generates inline `import("../..")` statements in the d.ts file,
// which API-Extractor leaves as is when generating the rollup, leaving them pointing at the wrong directory.
// API-Extractor issue: https://github.com/microsoft/rushstack/issues/4507
// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports
import { ValueSchema } from "../../core/index.js";
import {
	FieldKinds,
	type FlexAllowedTypes,
	FlexFieldSchema,
	SchemaBuilderInternal,
} from "../../feature-libraries/index.js";
import type { requireAssignableTo } from "../../util/index.js";
import { leaf } from "../leafDomain.js";

const builder = new SchemaBuilderInternal({
	scope: "com.fluidframework.json",
	libraries: [leaf.library],
});

const jsonPrimitives = [...leaf.primitives, leaf.null] as const;

/**
 * Types allowed as roots of Json content.
 */
export const jsonRoot = [() => jsonObject, () => jsonArray, ...jsonPrimitives] as const;

{
	// Recursive objects don't get this type checking automatically, so confirm it
	type _check = requireAssignableTo<typeof jsonRoot, FlexAllowedTypes>;
}

export const jsonObject = builder.mapRecursive(
	"object",
	FlexFieldSchema.createUnsafe(FieldKinds.optional, jsonRoot),
);

export const jsonArray = builder.fieldNodeRecursive(
	"array",
	FlexFieldSchema.createUnsafe(FieldKinds.sequence, jsonRoot),
);

export const jsonSchema = builder.intoLibrary();
