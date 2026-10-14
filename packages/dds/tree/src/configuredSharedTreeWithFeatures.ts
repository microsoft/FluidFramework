/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SharedObjectKind } from "@fluidframework/shared-object-base";

import type { SharedTreeFeatureOptions } from "./shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { RevertibleSupportDisabled } from "./shared-tree/revertibleSupportDisabled.js";
import type { ITree } from "./simple-tree/index.js";
import { configuredSharedTreeInternal, resolveOptions } from "./treeFactoryCore.js";

/**
 * Creates a SharedTree factory with explicitly enabled optional features.
 *
 * @remarks
 * Optional features are disabled unless the application supplies an enabled implementation.
 * Unlike {@link configuredSharedTreeAlpha}, this factory does not import enabled history recovery
 * as a default, so the application's imports determine whether that code is included in the bundle.
 *
 * Pass {@link RevertibleSupportEnabled} to include history recovery. Omit
 * {@link SharedTreeFeatureOptions.revertibleSupport} to exclude it.
 *
 * @example
 * ```typescript
 * import {
 * 	configuredSharedTreeWithFeaturesAlpha,
 * } from "@fluidframework/tree/alpha";
 *
 * const SharedTree = configuredSharedTreeWithFeaturesAlpha();
 * ```
 *
 * @param options - SharedTree options and the optional feature implementations to enable.
 * @returns A configured SharedTree factory.
 * @alpha
 */
export function configuredSharedTreeWithFeaturesAlpha(
	options: SharedTreeFeatureOptions = {},
): SharedObjectKind<ITree> {
	return configuredSharedTreeInternal(
		resolveOptions(options, options.revertibleSupport ?? RevertibleSupportDisabled),
	);
}
