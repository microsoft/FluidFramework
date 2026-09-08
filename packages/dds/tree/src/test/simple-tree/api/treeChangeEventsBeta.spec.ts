/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeChangeEvents, TreeChangeEventsBeta } from "../../../simple-tree/index.js";
import type { isAssignableTo, requireTrue } from "../../../util/index.js";

// Type tests
{
	type _betaChangeEventsAssignableToPublic = requireTrue<
		isAssignableTo<TreeChangeEventsBeta, TreeChangeEvents>
	>;
}
