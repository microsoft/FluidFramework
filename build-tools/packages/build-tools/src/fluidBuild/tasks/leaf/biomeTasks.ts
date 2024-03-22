/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import { GitRepo } from "../../../common/gitRepo";
import { LeafWithFileStatDoneFileTask } from "./leafTask";
import { getResolvedFluidRoot } from "../../../common/fluidUtils";
import findUp from "find-up";

export class BiomeTask extends LeafWithFileStatDoneFileTask {
	private repoRoot = getResolvedFluidRoot(true);
	private gitRepo = this.repoRoot.then((root) => new GitRepo(root));

	/**
	 * Includes all files in the task's package directory and any biome config files in the directory tree. Files ignored
	 * by git are excluded.
	 */
	protected async getInputFiles(): Promise<string[]> {
		const repoRoot = await this.repoRoot;
		const gitRepo = await this.gitRepo;

		const configFiles = await this.getBiomeConfigPaths(this.node.pkg.directory);
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
	 * Returns an array of all the biome config files found from the current working directory up to the root of the repo.
	 *
	 * Rather than parse and read the config files, this implementation naively searches for all config files from the
	 * task's package directory up to the root of the repo and assumes they're all used. In the future we might want to
	 * parse the config files anyway to extract ignore paths, at which point this implementation can change.
	 */
	private async getBiomeConfigPaths(cwd: string): Promise<string[]> {
		const repoRoot = await this.repoRoot;

		// The version of find-up we're using (5.0) doesn't support a stop directory and upgrading is challenging since
		// it's now ESM-only. This works around by stopping once we've stepped beyond the repo root.
		const config = isPathAbove(cwd, repoRoot)
			? undefined
			: await findUp(["biome.json", "biome.jsonc"], { cwd });
		if (config === undefined) {
			return [];
		}

		const parentDir = path.dirname(path.dirname(config));
		return [config].concat(await this.getBiomeConfigPaths(parentDir));
	}
}

/**
 * Returns true if path 1 is a parent path of path2 in the file tree.
 */
function isPathAbove(path1: string, path2: string): boolean {
	// If path1 is above path2 in the file tree, the relative path won't start with .. (which indicates a parent
	// directory) and won't be an absolute path. So, the function returns true if the relative path exists, doesn't start
	// with .., and isn't an absolute path. Otherwise, it returns false.
	const relative = path.relative(path1, path2);
	return !relative.startsWith("..") && !path.isAbsolute(relative);
}
