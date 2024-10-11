/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BiomeConfigReader } from "../../../common/biomeConfig";
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
	/**
	 * Use hashes instead of modified times in donefile.
	 */
	protected get useHashes(): boolean {
		return true;
	}

	private _configReader: BiomeConfigReader | undefined;

	private async getBiomeConfigReader(): Promise<BiomeConfigReader> {
		if (this._configReader === undefined) {
			this._configReader = await BiomeConfigReader.create(
				this.node.pkg.directory,
				this.context.gitRepo,
			);
		}
		return this._configReader;
	}

	/**
	 * Includes all files in the the task's package directory that Biome would format and any Biome config files that
	 * apply to the directory. Files ignored by git are excluded.
	 */
	protected async getInputFiles(): Promise<string[]> {
		const biomeConfig = await this.getBiomeConfigReader();
		// Absolute paths to files that would be formatted by biome.
		const { formattedFiles, allConfigs } = biomeConfig;
		return [...new Set([...allConfigs, ...formattedFiles])];
	}

	protected async getOutputFiles(): Promise<string[]> {
		const biomeConfig = await this.getBiomeConfigReader();
		return biomeConfig.formattedFiles;
	}
}
