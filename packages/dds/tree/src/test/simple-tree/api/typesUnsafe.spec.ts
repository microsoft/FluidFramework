/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	AnnotatedAllowedTypeUnsafe,
	System_Unsafe,
	UnannotateAllowedTypeUnsafe,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/typesUnsafe.js";
import { allowUnused } from "../../../simple-tree/index.js";
import {
	customizeSchemaTypingUnsafe,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/typesUnsafe.js";
import { SchemaFactory, type ValidateRecursiveSchema } from "../../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { numberSchema } from "../../../simple-tree/leafNodeSchema.js";
import type { areSafelyAssignable, requireTrue } from "../../../util/index.js";

{
	type MapInlined = System_Unsafe.ReadonlyMapInlined<string, typeof numberSchema>;
	type _check = requireTrue<areSafelyAssignable<MapInlined, ReadonlyMap<string, number>>>;

	// UnannotateAllowedTypeUnsafe
	{
		type num = UnannotateAllowedTypeUnsafe<typeof numberSchema>;
		allowUnused<requireTrue<areSafelyAssignable<num, typeof numberSchema>>>;

		const annotatedAllowedType = {
			type: numberSchema,
			metadata: {},
		} satisfies AnnotatedAllowedTypeUnsafe;

		type annotated = UnannotateAllowedTypeUnsafe<typeof annotatedAllowedType>;
		allowUnused<requireTrue<areSafelyAssignable<annotated, typeof numberSchema>>>;
	}
}

// customizeSchemaTypingUnsafe and InsertableObjectFromSchemaRecordUnsafe
{
	const sf = new SchemaFactory("recursive");
	// @ts-expect-error compiler differes from intelisense here
	class Bad extends sf.objectRecursive("O", {
		// @ts-expect-error customizeSchemaTypingUnsafe needs to be applied to the allowed types, not the field: this is wrong!
		recursive: customizeSchemaTypingUnsafe(sf.optionalRecursive([() => Bad])).custom<{
			input: 5;
		}>(),
	}) {}

	{
		// @ts-expect-error this should error
		type _check = ValidateRecursiveSchema<typeof Bad>;
	}

	class O extends sf.objectRecursive("O", {
		recursive: sf.optionalRecursive(
			customizeSchemaTypingUnsafe([() => O]).custom<{
				input: 5;
			}>(),
		),
	}) {}

	// Record
	{
		type T = System_Unsafe.InsertableObjectFromSchemaRecordUnsafe<typeof O.info>["recursive"];
		type _check = requireTrue<areSafelyAssignable<T, 5 | undefined>>;
	}

	// Field
	{
		type T = System_Unsafe.InsertableTreeFieldFromImplicitFieldUnsafe<
			typeof O.info.recursive.allowedTypes
		>;
		type _check = requireTrue<areSafelyAssignable<T, 5>>;
	}

	// AllowedTypes
	{
		type T = System_Unsafe.InsertableTreeNodeFromImplicitAllowedTypesUnsafe<
			typeof O.info.recursive.allowedTypes
		>;
		type _check = requireTrue<areSafelyAssignable<T, 5>>;
	}
}
