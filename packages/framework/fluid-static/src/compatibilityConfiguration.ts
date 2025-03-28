/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerRuntimeOptionsInternal } from "@fluidframework/container-runtime/internal";

import type { CompatibilityMode } from "./types.js";

/**
 * The CompatibilityMode selected determines the set of runtime options to use. In "1" mode we support
 * full interop with true 1.x clients, while in "2" mode we only support interop with 2.x clients.
 */
export const compatibilityModeRuntimeOptions: Record<
	CompatibilityMode,
	IContainerRuntimeOptionsInternal
> = {
	"1": {
		compatibilityMode: "1.0.0",
	},
	"2": {
		compatibilityMode: "2.0.0",
	},
};
