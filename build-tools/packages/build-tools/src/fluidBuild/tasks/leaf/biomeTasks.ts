/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "fs/promises";
import path from "path";
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

/**
 * This task enables incremental build support for Biome formatting tasks. It reads Biome configuration files to load
 * ignore settings, and will not consider ignored files when checking if the task needs to run.
 *
 * In addition, files that are ignored by git will be excluded. Internally the task uses git itself to enumerate files.
 *
 * IMPORTANT: While ignore settings are loaded and applied from the Biome configuration file, the "include" settings are
 * not consulted. This means that files may not be properly excluded by the task when using "include" and "ignore"
 * together.
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
	 * Includes all files in the the task's package directory that Biome would format and any Biome config files that
	 * apply to the directory.
	 */
	protected async getInputFiles(): Promise<string[]> {
		// Files that would be formatted by biome. Paths are relative to the package directory.
		const files = await this.getBiomeFormattedFiles(this.node.pkg.directory);
		const configPath = await this.getClosestBiomeConfigPath(this.node.pkg.directory);

		if (configPath === undefined) {
			// No configs to include, so just return all formatted files
			return [...new Set(files)];
		}

		const allConfigPaths = await getAllBiomeConfigPaths(configPath);
		return [...new Set([...allConfigPaths, ...files])];
	}

	protected async getOutputFiles(): Promise<string[]> {
		// Input and output files are the same.
		return this.getInputFiles();
	}

	/**
	 * Returns the absolute path to the closest Biome config file found from the current working directory up to the root
	 * of the repo.
	 */
	private async getClosestBiomeConfigPath(cwd: string): Promise<string | undefined> {
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
	 * Return an array of absolute paths to files that Biome would format under the provided path.
	 */
	private async getBiomeFormattedFiles(cwd: string): Promise<string[]> {
		const gitRepo = await this.gitRepo;

		/**
		 * All files that could possibly be formatted before ignore entries are applied. Paths are relative to the root of
		 * the repo.
		 */
		const allPossibleFiles = await gitRepo.getFiles(cwd);

		const configFile = await this.getClosestBiomeConfigPath(cwd);
		if (configFile === undefined) {
			// No config, so all files are formatted
			return allPossibleFiles;
		}

		const config = await loadBiomeConfig(configFile);
		const ignoreEntries = await getFormatterIgnoresFromConfig(config);

		const ignoreObject = ignore().add([...ignoreEntries]);
		const filtered = ignoreObject.filter(allPossibleFiles);

		this.traceExec(
			`Found ${allPossibleFiles.length} files to format, reduced to ${filtered.length} files by ignore settings.`,
		);

		// Convert repo-relative paths to absolute
		const repoRoot = await this.repoRoot;
		return filtered.map((filePath) => path.resolve(repoRoot, filePath));
	}
}

/**
 * Loads a Biome configuration file _without_ following any "extends" values. You probably want to use
 * {@link loadBiomeConfig} instead of this function.
 */
async function loadRawBiomeConfig(configPath: string): Promise<BiomeConfig> {
	const contents = await readFile(configPath, "utf8");
	const config: BiomeConfig = JSON5.parse(contents);
	return config;
}

/**
 * Returns an array of absolute paths to Biome config files. The paths are in the order in which they are merged by
 * Biome. That is, the last item in the array will be the absolute path to `configPath`.
 */
async function getAllBiomeConfigPaths(configPath: string): Promise<string[]> {
	const config = await loadRawBiomeConfig(configPath);
	let extendedConfigPaths: string[] = [];

	if (config.extends) {
		const pathsNested = await Promise.all(
			config.extends.map((configToExtend) =>
				getAllBiomeConfigPaths(path.join(path.dirname(configPath), configToExtend)),
			),
		);
		extendedConfigPaths = pathsNested.flat();
	}

	// Add the current config as the last one to be applied when they're merged
	extendedConfigPaths.push(configPath);
	return extendedConfigPaths;
}

/**
 * Loads a Biome configuration file. If the config extends others, then those are loaded recursively and the results are
 * merged. Array-type values are not merged, in accordance with how Biome applies configs.
 */
async function loadBiomeConfig(configPath: string): Promise<BiomeConfig> {
	const allConfigPaths = await getAllBiomeConfigPaths(configPath);
	const allConfigs = await Promise.all(
		allConfigPaths.map((pathToConfig) => loadRawBiomeConfig(pathToConfig)),
	);

	const mergedConfig = merge.withOptions(
		{
			// Biome does not merge arrays
			mergeArrays: false,
		},
		...allConfigs,
	);

	return mergedConfig;
}

/**
 * Given a Biome config object, returns the combined files.ignore and formatter.ignore values.
 */
async function getFormatterIgnoresFromConfig(config: BiomeConfig) {
	const filesIgnore = config.files?.ignore ?? [];
	const formatterIgnores = config.formatter?.ignore ?? [];
	return new Set([...filesIgnore, ...formatterIgnores]);
}
