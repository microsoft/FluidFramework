/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import { getResolvedFluidRoot } from "../../../common/fluidUtils";
import { GitRepo } from "../../../common/gitRepo";
import { LeafWithFileStatDoneFileTask } from "./leafTask";

// switch to regular import once building ESM
const findUp = import("find-up");

/**
 * This task enables incremental build support for Biome formatting tasks. It has important limitations.
 *
 * @remarks
 *
 * - The task does not read Biome configuration files to determine what files would be formatted. Instead it naively
 *   assumes all files would be formatted.
 * - All Biome configuration files found when looking up from the package directory to the root of the repo are
 *   considered used, whether the file is used.
 *
 * As of version 0.41.0, The task uses a content-based caching strategy, so it is less susceptible to invalidation than
 * earlier versions which were based on file modification times. However, the limitations above still apply.
 */
export class BiomeTask extends LeafWithFileStatDoneFileTask {
	// performance note: having individual tasks each acquire repo root and GitRepo
	// is quite inefficient. recommend passing such common things in a context object
	// to task constructors.
	private readonly repoRoot = getResolvedFluidRoot(true);
	private readonly gitRepo = this.repoRoot.then((repoRoot) => new GitRepo(repoRoot));

	/**
	 * Use hashes instead of modified times in donefile.
	 */
	protected get useHashes(): boolean {
		return true;
	}

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
		return (await findUp)
			.findUpMultiple(["biome.json", "biome.jsonc"], { cwd, stopAt: await this.repoRoot })
			.then((configs) => {
				if (configs.length === 0) {
					this.traceError(`Can't find biome config file`);
				}
				return configs;
			});
	}
}
