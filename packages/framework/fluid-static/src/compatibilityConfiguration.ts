/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerRuntimeOptionsInternal } from "@fluidframework/container-runtime/internal";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import { gte } from "semver-ts";

/**
 * The `minVersionForCollab` determines the set of runtime options to use.
 * For a 1.x `minVersionForCollab` we support full interop with true 1.x clients.
 * For a 2.x `minVersionForCollab` we only support interop with 2.x clients.
 *
 * @privateRemarks The purpose of this map is to use a different set of defaults
 * than what the runtime normally uses based on a given `minVersionForCollab` (e.g. `enableRuntimeIdCompressor` below).)
 */
const minVersionForCollabToDefaultRuntimeOptions: Record<
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

/**
 * Returns the fluid-static-specific runtime option overrides for the given `minVersionForCollab`.
 *
 * @remarks
 * The bulk of runtime defaults for a given `minVersionForCollab` are selected by container-runtime
 * (via `getMinVersionForCollabDefaults`). This function only contributes the additional overrides
 * that fluid-static needs to layer on top of those defaults.
 * @internal
 */
export function defaultRuntimeOptionsForMinVersion(
	minVersionForCollab: MinimumVersionForCollab,
): IContainerRuntimeOptionsInternal {
	return minVersionForCollabToDefaultRuntimeOptions[
		gte(minVersionForCollab, "2.0.0") ? "2" : "1"
	];
}
