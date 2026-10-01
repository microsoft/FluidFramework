/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { SchematizingSimpleTreeView, type TreeCheckout } from "../../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Sandbox synchronization requires internal branch APIs.
import type { UntypedTreeView } from "../../../simple-tree/api/index.js";

/**
 * Gets the internal checkout for a sandbox view.
 */
export function getCheckout(view: UntypedTreeView): TreeCheckout {
	assert(
		view instanceof SchematizingSimpleTreeView,
		"Expected view to be a SchematizingSimpleTreeView",
	);
	return view.checkout;
}
