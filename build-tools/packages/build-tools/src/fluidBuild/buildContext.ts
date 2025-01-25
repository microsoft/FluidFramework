/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BuildProjectConfig } from "@fluid-tools/build-infrastructure";
import type { SimpleGit } from "simple-git";
import type { IFluidBuildConfig } from "./fluidBuildConfig";

/**
 * A context object that is passed to fluid-build tasks. It is used to provide easy access to commonly-needed metadata
 * or tools.
 */
export interface BuildContext {
	/**
	 * The fluid-build configuration for the repo.
	 */
	readonly fluidBuildConfig: IFluidBuildConfig;

	readonly buildProjectLayout: BuildProjectConfig;

	/**
	 * The absolute path to the root of the Fluid repo.
	 *
	 * @deprecated Use fluidRepoLayout.root instead.
	 */
	readonly repoRoot: string;

	/**
	 * A GitRepo object that can be used to call git operations. It is rooted at `gitRoot`.
	 */
	readonly gitRepo: SimpleGit;

	/**
	 * The path to the git repo root.
	 */
	readonly gitRoot: string;
}
