/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerRuntimeOptionsInternal } from "@fluidframework/container-runtime/internal";

import type { CompatibilityMode } from "./types.js";

/**
 * The CompatibilityMode selected determines the set of runtime options to use. In "1" mode we support
 * full interop with true 1.x clients, while in "2" mode we only support interop with 2.x clients.
 *
 * @remarks In general, we can use the `compatibilityMode` property of `IContainerRuntimeOptionsInternal`
 * to get the proper configurations. However, there are some options that we need to explicity set that differ
 * from the default values (i.e. `enableRuntimeIdCompressor` below).
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
		// The runtime ID compressor is a prerequisite to use SharedTree but is off by default and must be explicitly enabled.
		// In general, we don't want to enable this by default since it increases the bundle size. However, since SharedTree
		// is bundled with the fluid-framework package, we need to enable it here to support SharedTree.
		enableRuntimeIdCompressor: "on",
	},
};
