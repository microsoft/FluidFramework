/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedTree } from "fluid-framework";
// eslint-disable-next-line import-x/no-internal-modules
import { SharedMap } from "fluid-framework/legacy";

export function apisToBundle(): {
	SharedMap: typeof SharedMap;
	SharedTree: typeof SharedTree;
} {
	return {
		SharedMap,
		SharedTree,
	};
}
