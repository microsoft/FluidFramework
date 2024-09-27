/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { GitRepo } from "../common/gitRepo";
import type { IFluidBuildConfig } from "./fluidBuildConfig";

/**
 * A context object that is passed to fluid-build tasks. It is used to provide easy access to commonly-needed metadata
 * or tools.
 */
export interface BuildContext {
	/**
	 * The fluid-build configuration for the repo.
	 */
	fluidBuildConfig: IFluidBuildConfig | undefined;

	/**
	 * The absolute path to the root of the repo.
	 */
	repoRoot: string;

	/**
	 * A GitRepo object that can be used to call git operations.
	 */
	gitRepo: GitRepo;
}
