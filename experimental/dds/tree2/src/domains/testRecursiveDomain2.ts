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

import { FieldKinds, schemaBuilder3 } from "../feature-libraries";
import { areSafelyAssignable, isAny, requireFalse, requireTrue } from "../util";

const builder = new schemaBuilder3.SchemaBuilder({
	scope: "com.fluidframework.test",
	fieldKinds: FieldKinds,
});

export class Empty extends builder.struct("empty", {}) {}

const recursiveReference = () => RecursiveStruct;
schemaBuilder3.fixRecursiveReference(recursiveReference);

/**
 * @alpha
 */
export class RecursiveStruct extends builder.struct("recursiveStruct2", {
	recursive: builder.field.optional(recursiveReference),
	number: builder.field.required(Empty),
}) {}

type _0 = requireFalse<isAny<typeof RecursiveStruct>>;
type _1 = requireTrue<
	areSafelyAssignable<
		typeof RecursiveStruct,
		ReturnType<(typeof RecursiveStruct.structFieldsObject.recursive.allowedTypes)[0]>
	>
>;

/**
 * @alpha
 */
// export const jsonSchema = builder.finalize();
