/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	configuredSharedTreeAlpha,
	RevertibleSupportEnabled,
} from "@fluidframework/tree/alpha";

export const SharedTree = configuredSharedTreeAlpha({
	revertibleSupport: RevertibleSupportEnabled,
});
