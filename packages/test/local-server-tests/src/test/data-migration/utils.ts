/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";

export const runtimeOptions: IContainerRuntimeOptions = {
	summaryOptions: {
		summaryConfigOverrides: {
			state: "disabled",
		},
	},
	enableRuntimeIdCompressor: "on",
};
