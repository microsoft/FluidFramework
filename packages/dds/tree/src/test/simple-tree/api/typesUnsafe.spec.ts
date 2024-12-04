/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	customizeSchemaTypingUnsafe,
	type InsertableObjectFromSchemaRecordUnsafe,
	type InsertableTreeFieldFromImplicitFieldUnsafe,
	type InsertableTreeNodeFromImplicitAllowedTypesUnsafe,
	type ReadonlyMapInlined,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/typesUnsafe.js";
import { SchemaFactory, type ValidateRecursiveSchema } from "../../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { numberSchema } from "../../../simple-tree/leafNodeSchema.js";
import type { areSafelyAssignable, requireTrue } from "../../../util/index.js";

{
	type MapInlined = ReadonlyMapInlined<string, typeof numberSchema>;
	type _check = requireTrue<areSafelyAssignable<MapInlined, ReadonlyMap<string, number>>>;
}

// customizeSchemaTypingUnsafe and InsertableObjectFromSchemaRecordUnsafe
{
	const sf = new SchemaFactory("recursive");
	class Bad extends sf.objectRecursive("O", {
		// customizeSchemaTypingUnsafe needs to be applied to the allowed types, not eh field: this is wrong!
		recursive: customizeSchemaTypingUnsafe(sf.optionalRecursive([() => Bad])).custom<{
			input: 5;
		}>(),
	}) {}

	{
		// Ideally this would error, but detecting this is invalid is hard.
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
		type T = InsertableObjectFromSchemaRecordUnsafe<typeof O.info>["recursive"];
		type _check = requireTrue<areSafelyAssignable<T, 5 | undefined>>;
	}

	// Field
	{
		type T = InsertableTreeFieldFromImplicitFieldUnsafe<typeof O.info.recursive.allowedTypes>;
		type _check = requireTrue<areSafelyAssignable<T, 5>>;
	}

	// AllowedTypes
	{
		type T = InsertableTreeNodeFromImplicitAllowedTypesUnsafe<
			typeof O.info.recursive.allowedTypes
		>;
		type _check = requireTrue<areSafelyAssignable<T, 5>>;
	}
}
