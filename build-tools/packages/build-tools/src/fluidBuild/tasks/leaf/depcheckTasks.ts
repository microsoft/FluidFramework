/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import { getResolvedFluidRoot } from "../../fluidUtils";
import { GitRepo } from "../../../common/gitRepo";
import { LeafWithFileStatDoneFileTask } from "./leafTask";

// switch to regular import once building ESM
const findUp = import("find-up");

export class DepcheckTask extends LeafWithFileStatDoneFileTask {
	// performance note: having individual tasks each acquire repo root and GitRepo
	// is quite inefficient. recommend passing such common things in a context object
	// to task constructors.
	private readonly repoRoot = getResolvedFluidRoot(true);
	private readonly gitRepo = this.repoRoot.then((repoRoot) => new GitRepo(repoRoot));

	/**
	 * Includes all files in the task's package directory and any biome config files in the directory tree. Files ignored
	 * by git are excluded.
	 */
	protected async getInputFiles(): Promise<string[]> {
		const repoRoot = await this.repoRoot;
		const gitRepo = await this.gitRepo;

		const configFiles = await this.getDepcheckConfigPaths(this.node.pkg.directory);
		const files = (await gitRepo.getFiles(this.node.pkg.directory)).map((file) =>
			path.join(repoRoot, file),
		);

		return [...new Set([...configFiles, ...files])];
	}

	protected async getOutputFiles(): Promise<string[]> {
		// Input and output files are the same.
		return this.getInputFiles();
	}

	/**
	 * Returns an array of all the depcheckrc config files found from the current working directory up to the root of the repo.
	 *
	 * Rather than parse and read the config files, this implementation naively searches for all config files from the
	 * task's package directory up to the root of the repo and assumes they're all used. In the future we might want to
	 * parse the config files anyway to extract ignore paths, at which point this implementation can change.
	 */
	private async getDepcheckConfigPaths(cwd: string): Promise<string[]> {
		return (await findUp)
			.findUpMultiple([".depcheckrc"], { cwd, stopAt: await this.repoRoot })
			.then((configs) => {
				return configs;
			});
	}
}
