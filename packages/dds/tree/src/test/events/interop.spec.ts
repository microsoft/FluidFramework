/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	UnionToIntersection,
	// eslint-disable-next-line import/no-internal-modules
} from "../../events/interop.js";
import type { areSafelyAssignable, requireTrue } from "../../util/index.js";

// UnionToIntersection
{
	type U = UnionToIntersection<1 | 2>;
	type _check = requireTrue<areSafelyAssignable<U, never>>;

	type U2 = UnionToIntersection<number | 5>;
	type _check2 = requireTrue<areSafelyAssignable<U2, number>>;
}
