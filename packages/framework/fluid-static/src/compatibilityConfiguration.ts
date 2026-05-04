/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerRuntimeOptionsInternal } from "@fluidframework/container-runtime/internal";

/**
 * The CompatibilityMode (minVersionForCollab) determines the set of runtime options to use.
 * For a 1.x minVersionForCollab we support full interop with true 1.x clients.
 * For a 2.x minVersionForCollab we only support interop with 2.x clients.
 *
 * @privateRemarks This is for when we want to use a different set of defaults than the defaults for a given
 * minVersionForCollab (i.e. `enableRuntimeIdCompressor` below).
 */
export const minVersionForCollabToDefaultRuntimeOptions: Record<
	"1" | "2",
	IContainerRuntimeOptionsInternal
> = {
	"1": {},
	"2": {
		// The runtime ID compressor is a prerequisite to use SharedTree but is off by default and must be explicitly enabled.
		// In general, we don't want to enable this by default since it increases the bundle size. However, since SharedTree
		// is bundled with the fluid-framework package, we need to enable it here to support SharedTree.
		enableRuntimeIdCompressor: "on",
	},
};
