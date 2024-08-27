/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BiomeConfigReader } from "../../../common/biomeConfig";
import { getResolvedFluidRoot } from "../../../common/fluidUtils";
import { GitRepo } from "../../../common/gitRepo";
import { LeafWithFileStatDoneFileTask } from "./leafTask";

/**
 * This task enables incremental build support for Biome formatting tasks. It reads Biome configuration files to load
 * the 'include' and 'ignore' settings, and will not consider other files when checking if the task needs to run.
 *
 * The task will consider the 'extends' value and load nested Biome configs. The configs will be merged, but array-type
 * settings like 'includes' and 'ignores' are not merged - the top-most config wins for such keys.
 *
 * Note that .gitignored paths are always excluded, regardless of the "vcs" setting in the Biome configuration.
 * Internally the task uses git itself to enumerate files, and files that aren't enumerated are not considered.
 */
export class BiomeTask extends LeafWithFileStatDoneFileTask {
	// performance note: having individual tasks each acquire repo root and GitRepo
	// is quite inefficient. recommend passing such common things in a context object
	// to task constructors.
	private readonly repoRoot = getResolvedFluidRoot(true);
	private readonly gitRepo = this.repoRoot.then((repoRoot) => new GitRepo(repoRoot));
	private readonly biomeConfig = this.gitRepo.then((gitRepo) =>
		BiomeConfigReader.create(this.node.pkg.directory, gitRepo),
	);

	/**
	 * Use hashes instead of modified times in donefile.
	 */
	protected get useHashes(): boolean {
		return true;
	}

	/**
	 * Includes all files in the the task's package directory that Biome would format and any Biome config files that
	 * apply to the directory. Files ignored by git are excluded.
	 */
	protected async getInputFiles(): Promise<string[]> {
		const biomeConfig = await this.biomeConfig;
		// Absolute paths to files that would be formatted by biome.
		const { formattedFiles, allConfigs } = biomeConfig;
		return [...new Set([...allConfigs, ...formattedFiles])];
	}

	protected async getOutputFiles(): Promise<string[]> {
		return (await this.biomeConfig).formattedFiles;
	}
}
