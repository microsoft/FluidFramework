/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedMap, SharedTree } from "fluid-framework";

export function apisToBundle() {
	SharedMap.getFactory();
	SharedMap.create({} as any);
	SharedTree.getFactory();
}
