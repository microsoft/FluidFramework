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

import { AllowedTypes, FieldKinds, FieldSchema } from "../feature-libraries";
import { areSafelyAssignable, isAny, requireFalse, requireTrue } from "../util";
import * as leaf from "./leafDomain";
import { SchemaBuilder } from "./schemaBuilder";

const builder = new SchemaBuilder({ scope: "Test Recursive Domain" });

/**
 * @alpha
 */
export const recursiveStruct = builder.structRecursive("struct", {
	recursive: FieldSchema.createUnsafe(FieldKinds.optional, [() => recursiveStruct]),
	number: leaf.number,
});

// Some related information in https://github.com/microsoft/TypeScript/issues/55758.
function fixRecursiveReference<T extends AllowedTypes>(...types: T): void {}

const recursiveReference = () => recursiveStruct2;
fixRecursiveReference(recursiveReference);

/**
 * @alpha
 */
export const recursiveStruct2 = builder.struct("struct2", {
	recursive: FieldSchema.create(FieldKinds.optional, [recursiveReference]),
	number: leaf.number,
});

type _0 = requireFalse<isAny<typeof recursiveStruct2>>;
type _1 = requireTrue<
	areSafelyAssignable<
		typeof recursiveStruct2,
		ReturnType<(typeof recursiveStruct2.structFieldsObject.recursive.allowedTypes)[0]>
	>
>;
/**
 * @alpha
 */
export const library = builder.finalize();
