/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerRuntimeOptionsInternal } from "@fluidframework/container-runtime/internal";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import { gte } from "semver-ts";

/**
 * Fluid-static-specific runtime option overrides keyed by `minVersionForCollab`.
 *
 * @remarks
 * These are layered on top of the runtime defaults that container-runtime selects from
 * `minVersionForCollab` (via `getMinVersionForCollabDefaults`). Only options that
 * fluid-static needs to set differently from those defaults belong here
 * (e.g. enableRuntimeIdCompressor to support SharedTree).
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
