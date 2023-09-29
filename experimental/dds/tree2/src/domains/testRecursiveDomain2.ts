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

import { FieldKinds, schemaBuilder2 } from "../feature-libraries";
import { areSafelyAssignable, isAny, requireFalse, requireTrue } from "../util";

const builder = new schemaBuilder2.SchemaBuilder({
	scope: "com.fluidframework.test",
	fieldKinds: FieldKinds,
});

export class Empty extends builder.struct("empty", {}) {}

const _x: schemaBuilder2.StructSchema = Empty;

/**
 * @alpha
 */
export class RecursiveStruct extends builder.structRecursive("recursiveStruct", {
	recursive: builder.fieldRecursive.optional(() => RecursiveStruct),
	number: builder.field.value(Empty),
}) {}

// Some related information in https://github.com/microsoft/TypeScript/issues/55758.
function fixRecursiveReference<T extends schemaBuilder2.AllowedTypes>(...types: T): void {}

const recursiveReference = () => RecursiveStruct2;
fixRecursiveReference(recursiveReference);

/**
 * @alpha
 */
export class RecursiveStruct2 extends builder.struct("recursiveStruct2", {
	recursive: builder.field.optional(recursiveReference),
	number: builder.field.value(Empty),
}) {}

type _0 = requireFalse<isAny<typeof RecursiveStruct2>>;
type _1 = requireTrue<
	areSafelyAssignable<
		typeof RecursiveStruct2,
		ReturnType<typeof RecursiveStruct2.structFieldsObject.recursive.allowedTypes[0]>
	>
>;
/**
 * @alpha
 */
// export const jsonSchema = builder.intoLibrary();
