/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	AnnotatedAllowedTypeUnsafe,
	System_Unsafe,
	UnannotateAllowedTypeUnsafe,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../simple-tree/api/typesUnsafe.js";
import { allowUnused, SchemaFactoryBeta } from "../../../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { numberSchema } from "../../../simple-tree/leafNodeSchema.js";
import type {
	areSafelyAssignable,
	requireAssignableTo,
	requireTrue,
} from "../../../util/index.js";

type MapInlined = System_Unsafe.ReadonlyMapInlined<string, typeof numberSchema>;

type _check = requireTrue<areSafelyAssignable<MapInlined, ReadonlyMap<string, number>>>;

// UnannotateAllowedTypeUnsafe
{
	type num = UnannotateAllowedTypeUnsafe<typeof numberSchema>;
	allowUnused<requireTrue<areSafelyAssignable<num, typeof numberSchema>>>();

	const annotatedAllowedType = {
		type: numberSchema,
		metadata: {},
	} satisfies AnnotatedAllowedTypeUnsafe;

	type annotated = UnannotateAllowedTypeUnsafe<typeof annotatedAllowedType>;
	allowUnused<requireTrue<areSafelyAssignable<annotated, typeof numberSchema>>>();
}

// InsertableTreeNodeFromImplicitAllowedTypesUnsafe
{
	// One type
	{
		const types = [SchemaFactoryBeta.number] as const;
		type Insertable = System_Unsafe.InsertableTreeNodeFromImplicitAllowedTypesUnsafe<
			typeof types
		>;
		allowUnused<requireTrue<areSafelyAssignable<number, Insertable>>>();
	}

	// Multiple types
	{
		const types = [SchemaFactoryBeta.string, SchemaFactoryBeta.number] as const;
		type Insertable = System_Unsafe.InsertableTreeNodeFromImplicitAllowedTypesUnsafe<
			typeof types
		>;
		allowUnused<requireTrue<areSafelyAssignable<number | string, Insertable>>>();
	}

	// AllowedTypesFullFromMixedUnsafe:
	// SchemaFactoryBeta.typesRecursive uses AllowedTypesFullFromMixedUnsafe which produces an intersection of
	// UnannotateAllowedTypesListUnsafe<...> & AnnotatedAllowedTypes<...>
	// This intersection can cause issues, and has caused issues in the past.
	// These tests are regression tests for one such issue, where the intersection caused
	// InsertableTreeNodeFromImplicitAllowedTypesUnsafe to produce `never` instead of the desired type union
	// when multiple types were provided.
	{
		// One type
		{
			const types = SchemaFactoryBeta.typesRecursive([SchemaFactoryBeta.number]);
			type Insertable = System_Unsafe.InsertableTreeNodeFromImplicitAllowedTypesUnsafe<
				typeof types
			>;
			allowUnused<requireTrue<areSafelyAssignable<number, Insertable>>>();
		}

		// Multiple types
		{
			const types = SchemaFactoryBeta.typesRecursive([
				SchemaFactoryBeta.string,
				SchemaFactoryBeta.number,
			]);

			type Insertable = System_Unsafe.InsertableTreeNodeFromImplicitAllowedTypesUnsafe<
				typeof types
			>;
			allowUnused<requireAssignableTo<number, Insertable>>();
			allowUnused<requireAssignableTo<string, Insertable>>();
			allowUnused<requireTrue<areSafelyAssignable<number | string, Insertable>>>();
		}
	}
}
