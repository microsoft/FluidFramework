/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This bundle probe intentionally targets the emitted alpha entrypoint.
// eslint-disable-next-line import-x/no-internal-modules
import { configuredSharedTree, ForestTypeOptimized } from "fluid-framework/alpha";

export const SharedTree = configuredSharedTree({
	forest: ForestTypeOptimized,
});
