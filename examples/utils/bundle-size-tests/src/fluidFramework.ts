/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedTree } from "fluid-framework";
// eslint-disable-next-line import/no-internal-modules
import { SharedMap } from "fluid-framework/legacy";

export function apisToBundle() {
	return {
		SharedMap,
		SharedTree,
	};
}
