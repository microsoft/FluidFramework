/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "fs/promises";
import ignore from "ignore";
import * as JSON5 from "json5";
import { merge } from "ts-deepmerge";
import { getResolvedFluidRoot } from "../../../common/fluidUtils";
import { GitRepo } from "../../../common/gitRepo";
import { LeafWithFileStatDoneFileTask } from "./leafTask";

// switch to regular import once building ESM
const findUp = import("find-up");

/**
 * A type defining the Biome config file. Only the fields we care about are included.
 *
 * @privateRemarks
 *
 * Biome does have a JSON schema for the config format, so in the future if we need more comprehensive config file
 * handling, this should be updated to use the schema instead.
 */
interface BiomeConfig {
	extends?: string[];
	files?: {
		ignore?: string[];
	};
	formatter?: {
		ignore?: string[];
	};
}

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
	 * Includes all files in the the task's package directory that Biome would format and any Biome config files in the
	 * directory tree.
	 *
	 * TODO: currently only includes the main config file. Need to follow extends and get paths for all of them.
	 */
	protected async getInputFiles(): Promise<string[]> {
		// Files that would be formatted by biome. Paths are relative to the package directory
		const files = await this.getBiomeFormattedFiles(this.node.pkg.directory);
		const configFile = await this.getBiomeConfigPath(this.node.pkg.directory);

		return configFile === undefined
			? [...new Set(files)]
			: [...new Set([configFile, ...files])];
	}

	protected async getOutputFiles(): Promise<string[]> {
		// Input and output files are the same.
		return this.getInputFiles();
	}

	/**
	 * Returns the closest biome config file found from the current working directory up to the root of the repo.
	 */
	private async getBiomeConfigPath(cwd: string): Promise<string | undefined> {
		return (await findUp)
			.findUp(["biome.json", "biome.jsonc"], { cwd, stopAt: await this.repoRoot })
			.then((config) => {
				if (config === undefined) {
					this.traceError(`Can't find biome config file`);
				}
				return config;
			});
	}

	/**
	 * Return an array of paths to files that Biome would format under the provided path. The returned paths are relative
	 * to the root of the repo.
	 */
	private async getBiomeFormattedFiles(cwd: string): Promise<string[]> {
		// const repoRoot = await this.repoRoot;
		const gitRepo = await this.gitRepo;

		/**
		 * All files that could possibly be formatted before ignore entries are applied. Paths are relative to the root of
		 * the repo.
		 */
		const allPossibleFiles = await gitRepo.getFiles(cwd);

		const configFile = await this.getBiomeConfigPath(cwd);
		if (configFile === undefined) {
			// No config, so all files are formatted
			return allPossibleFiles;
		}

		const config = await loadBiomeConfig(configFile);
		const ignoreEntries = await getFormatterIgnoresFromConfig(config);

		const ignoreObject = ignore().add([...ignoreEntries]);
		const filtered = ignoreObject.filter(allPossibleFiles);

		console.warn(
			`Found ${allPossibleFiles.length} files to format, reduced to ${filtered.length} files.`,
		);

		return filtered;
	}
}

/**
 * Loads a Biome configuration file. If the config extends others, then those are loaded recursively and the results are
 * merged. Array-type values are not merged, in accordance with how Biome applies configs.
 */
async function loadBiomeConfig(configPath: string): Promise<BiomeConfig> {
	const contents = await readFile(configPath, "utf8");
	const config: BiomeConfig = JSON5.parse(contents);

	if (config.extends !== undefined && config.extends.length > 0) {
		// Iterate through each extended config, load it, then merge them
		const configsToMerge = await Promise.all(
			config.extends.map((configPath) => loadBiomeConfig(configPath)),
		);
		// Add the current config as the last one to be applied when they're merged
		configsToMerge.push(config);

		const mergedConfig = merge.withOptions(
			{
				// Biome does not merge arrays
				mergeArrays: false,
			},
			...configsToMerge,
		);

		return mergedConfig;
	}

	// extends is undefined, so return the config as-is
	return config;
}

/**
 * Given a Biome config object, returns the combined files.ignore and formatter.ignore values.
 */
async function getFormatterIgnoresFromConfig(config: BiomeConfig) {
	const filesIgnore = config.files?.ignore ?? [];
	const formatterIgnores = config.formatter?.ignore ?? [];
	return new Set([...filesIgnore, ...formatterIgnores]);
}
