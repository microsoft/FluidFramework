/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	AnnotatedAllowedTypeUnsafe,
	System_Unsafe,
	UnannotateAllowedTypeUnsafe,
	UnannotateImplicitAllowedTypesUnsafe,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/typesUnsafe.js";
import {
	allowUnused,
	type ImplicitAnnotatedAllowedTypes,
} from "../../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { numberSchema, type stringSchema } from "../../../simple-tree/leafNodeSchema.js";
import type { areSafelyAssignable, requireTrue } from "../../../util/index.js";

type MapInlined = System_Unsafe.ReadonlyMapInlined<string, typeof numberSchema>;

type _check = requireTrue<areSafelyAssignable<MapInlined, ReadonlyMap<string, number>>>;

// UnannotateAllowedTypesUnsafe
{
	type num = UnannotateAllowedTypeUnsafe<typeof numberSchema>;
	allowUnused<requireTrue<areSafelyAssignable<num, typeof numberSchema>>>;

	const annotatedAllowedType = {
		type: numberSchema,
		metadata: {},
	} satisfies AnnotatedAllowedTypeUnsafe;

	type annotated = UnannotateAllowedTypeUnsafe<typeof annotatedAllowedType>;
	// This case adds a wrapping array, which odd but potentially fine.
	allowUnused<requireTrue<areSafelyAssignable<annotated, typeof numberSchema>>>;
}

// UnannotateImplicitAllowedTypesUnsafe
{
	type num = UnannotateImplicitAllowedTypesUnsafe<typeof numberSchema>;
	allowUnused<requireTrue<areSafelyAssignable<num, typeof numberSchema>>>;

	type union = UnannotateImplicitAllowedTypesUnsafe<
		[typeof numberSchema, typeof stringSchema]
	>;
	allowUnused<
		requireTrue<
			areSafelyAssignable<union, readonly [typeof numberSchema, typeof stringSchema]>
		>
	>;

	const annotatedAllowedType = {
		type: numberSchema,
		metadata: {},
	} satisfies ImplicitAnnotatedAllowedTypes;

	type annotated = UnannotateImplicitAllowedTypesUnsafe<typeof annotatedAllowedType>;
	// This case adds a wrapping array, which odd but potentially fine.
	allowUnused<requireTrue<areSafelyAssignable<annotated, readonly [typeof numberSchema]>>>;

	const annotatedAllowedTypes = {
		types: [annotatedAllowedType] as const,
		metadata: {},
	} satisfies ImplicitAnnotatedAllowedTypes;

	type annotated2 = UnannotateImplicitAllowedTypesUnsafe<typeof annotatedAllowedTypes>;
	// This case adds a wrapping array, which odd but potentially fine.
	allowUnused<requireTrue<areSafelyAssignable<annotated2, readonly [typeof numberSchema]>>>;

	const annotatedAllowedTypesArray = [
		annotatedAllowedType,
	] as const satisfies ImplicitAnnotatedAllowedTypes;

	type annotatedArray = UnannotateImplicitAllowedTypesUnsafe<
		typeof annotatedAllowedTypesArray
	>;

	allowUnused<
		requireTrue<areSafelyAssignable<annotatedArray, readonly [typeof numberSchema]>>
	>;
}
