/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InterdependencyRange } from "@fluid-tools/version-tools";
import { TaskDefinitionsOnDisk } from "./fluidTaskDefinitions";

/**
 * The version of the fluidBuild configuration currently used.
 *
 * @remarks
 *
 * This is not exported outside of the build-tools package; it is only used internally.
 */
export const FLUIDBUILD_CONFIG_VERSION = 1;

/**
 * Top-most configuration for repo build settings.
 */
export interface IFluidBuildConfig {
	/**
	 * The version of the config.
	 *
	 * IMPORTANT: this will become required in a future release.
	 */
	version?: typeof FLUIDBUILD_CONFIG_VERSION;

	/**
	 * Build tasks and dependencies definitions
	 */
	tasks?: TaskDefinitionsOnDisk;

	/**
	 * A mapping of package or release group names to metadata about the package or release group. This can only be
	 * configured in the repo-wide Fluid build config (the repo-root package.json).
	 */
	repoPackages?: IFluidBuildDirs;
}

/**
 * Configures a package or release group
 */
export interface IFluidBuildDir {
	/**
	 * The path to the package. For release groups this should be the path to the root of the release group.
	 */
	directory: string;

	/**
	 * An array of paths under `directory` that should be ignored.
	 */
	ignoredDirs?: string[];

	/**
	 * For backwards compatibility, the defaultInterdependencyRange for a release group can be configured here in the
	 * fluid-build config. This property should no longer be used and will be removed in a future release.
	 *
	 * @deprecated This property is now configured in the bump.defaultInterdependencyRange setting in the flub config.
	 * This property will be removed in a future release.
	 */
	defaultInterdependencyRange?: InterdependencyRange;
}

export type IFluidBuildDirEntry = string | IFluidBuildDir | (string | IFluidBuildDir)[];

export interface IFluidBuildDirs {
	[name: string]: IFluidBuildDirEntry;
}
