/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { GitRepo } from "../common/gitRepo";
import type { IFluidBuildConfig } from "./fluidBuildConfig";
import type { SharedCacheManager } from "./sharedCache/sharedCacheManager";

/**
 * A context object that is passed to fluid-build tasks. It is used to provide easy access to commonly-needed metadata
 * or tools.
 */
export interface BuildContext {
	/**
	 * The fluid-build configuration for the repo.
	 */
	readonly fluidBuildConfig: IFluidBuildConfig;

	/**
	 * The absolute path to the root of the repo.
	 */
	readonly repoRoot: string;

	/**
	 * A GitRepo object that can be used to call git operations.
	 */
	readonly gitRepo: GitRepo;

	/**
	 * The shared cache manager for caching task outputs across builds.
	 * Optional - only initialized if cache is enabled.
	 */
	readonly sharedCache?: SharedCacheManager;
}
