/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	configuredSharedTreeWithFeaturesAlpha,
	RevertibleSupportEnabled,
} from "@fluidframework/tree/alpha";

export const SharedTree = configuredSharedTreeWithFeaturesAlpha({
	revertibleSupport: RevertibleSupportEnabled,
});
