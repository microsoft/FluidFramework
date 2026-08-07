/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Here we intentionally leak everything reachable from the alpha entry point.
// This captures a worst case (except for internal and legacy) non-tree shaken bundle.
// eslint-disable-next-line import-x/no-internal-modules -- We need to import alpha to measure it.
import * as Framework from "fluid-framework/alpha";

export function apisToBundle(): typeof Framework {
	return Framework;
}
