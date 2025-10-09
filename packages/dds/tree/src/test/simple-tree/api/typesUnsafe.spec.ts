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
// eslint-disable-next-line import/no-internal-modules
import { numberSchema } from "../../../simple-tree/leafNodeSchema.js";
import type { areSafelyAssignable, requireTrue } from "../../../util/index.js";

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
