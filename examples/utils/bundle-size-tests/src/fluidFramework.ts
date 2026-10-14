/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Canary-only: drop SharedTree to shrink the fluidFramework.js bundle and
// demonstrate the workflow's green indicator.
// eslint-disable-next-line import-x/no-internal-modules
import { SharedMap } from "fluid-framework/legacy";

export function apisToBundle(): {
	SharedMap: typeof SharedMap;
} {
	return {
		SharedMap,
	};
}
