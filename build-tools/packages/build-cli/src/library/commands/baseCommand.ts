/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IBuildProject,
	findGitRootSync,
	loadBuildProject,
} from "@fluid-tools/build-infrastructure";
import { BaseCommand } from "./base.js";
import type { Command } from "@oclif/core";

export abstract class BaseCommandWithBuildProject<
	T extends typeof Command
> extends BaseCommand<T> {
	private _buildProject: IBuildProject | undefined;

	public getBuildProject(repoRoot?: string): IBuildProject {
		if (this._buildProject === undefined) {
			const root = repoRoot ?? findGitRootSync();
			this._buildProject = loadBuildProject(root);
		}

		return this._buildProject;
	}
}
