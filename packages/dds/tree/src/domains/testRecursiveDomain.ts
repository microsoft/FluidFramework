/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This file exists and is package exported to aid in testing of exporting recursive types across package boundaries.
 * Sometimes when TypeScript generates d.ts files, they type check significantly differently than the original source (One example of this: https://github.com/microsoft/TypeScript/issues/20979).
 * Unfortunately our recursive schema types are an example of types that have this kind of issue: the d.ts files tend to get "any" instead of the recursive type reference.
 * Currently we do not have tooling in place to test this in our test suite, and exporting these types here is a temporary crutch to aid in diagnosing this issue.
 */

import { FieldKinds, FlexFieldSchema, SchemaBuilderBase } from "../feature-libraries/index.js";
import { leaf } from "./leafDomain.js";

const builder = new SchemaBuilderBase(FieldKinds.optional, { scope: "Test Recursive Domain" });

export const recursiveObject = builder.objectRecursive("object", {
	recursive: FlexFieldSchema.createUnsafe(FieldKinds.optional, [() => recursiveObject]),
	number: leaf.number,
});

export const library = builder.intoLibrary();

{
	const b = new SchemaBuilderBase(FieldKinds.optional, { scope: "Test Recursive Domain" });
	const node = b.objectRecursive("object", {
		child: FlexFieldSchema.createUnsafe(FieldKinds.optional, [() => node]),
	});
	const _field = FlexFieldSchema.createUnsafe(FieldKinds.optional, [node]);
	// All these cause TSC to "RangeError: Maximum call stack size exceeded"
	// const _field4 = FlexFieldSchema.create(FieldKinds.optional, [node]);
	// const _field2 = b.optional(node);
	// const _field3 = SchemaBuilder.optional(node);
	// const schema = b.intoSchema(field);
	// const schema = b.intoSchema(_field);
}
