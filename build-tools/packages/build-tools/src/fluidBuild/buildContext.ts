/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { GitRepo } from "../common/gitRepo";
import type { IFluidBuildConfig } from "./fluidBuildConfig";

export interface BuildContext {
	fluidBuildConfig: IFluidBuildConfig | undefined;
	repoRoot: string;
	gitRepo: GitRepo;
}
