/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { configuredSharedTreeBeta, ForestTypeExpensiveDebug } from "fluid-framework/beta";

export const SharedTree = configuredSharedTreeBeta({
	forest: ForestTypeExpensiveDebug,
});
