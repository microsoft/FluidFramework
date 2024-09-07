/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import ignore from "ignore";
import * as JSON5 from "json5";
import multimatch from "multimatch";
import { merge } from "ts-deepmerge";
// Note: in more recent versions of type-fest, this type has been replaced with "Tagged"
// We are using version 2.x because of this issue: https://github.com/sindresorhus/type-fest/issues/547
import type { Opaque } from "type-fest";

import type { Configuration as BiomeConfigRaw } from "./biomeConfigTypes";
import type { GitRepo } from "./gitRepo";

// switch to regular import once building ESM
const findUp = import("find-up");

/**
 * Convenience type to represent a Biome config that has been loaded while following and merging the
 * "extends" values. This helps differentiate between the single loaded configs and the fully resolved config.
 */
export type BiomeConfigResolved = Opaque<BiomeConfigRaw, "BiomeConfigResolved">;

/**
 * Loads a Biome configuration file _without_ following any 'extends' values. You probably want to use
 * {@link loadBiomeConfigs} instead of this function.
 */
async function loadRawBiomeConfig(configPath: string): Promise<BiomeConfigRaw> {
	const contents = await readFile(configPath, "utf8");
	const config: BiomeConfigRaw = JSON5.parse(contents);
	return config;
}

/**
 * Returns an array of absolute paths to Biome config files. The paths are in the order in which they are merged by
 * Biome. That is, the last item in the array will be the absolute path to `configPath`.
 */
export async function getAllBiomeConfigPaths(configPath: string): Promise<string[]> {
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
 *
 * @remarks
 *
 * The intent is to merge the configs in the same way that Biome itself does, but the implementation is based on the
 * Biome documentation, so there may be subtle differences unaccounted for. Where this implementation diverges from
 * Biome's behavior, this function should be considered incorrect.
 *
 * Relevant Biome documentation: {@link https://biomejs.dev/guides/configure-biome/#share-a-configuration-file}
 */
export async function loadBiomeConfig(configPath: string): Promise<BiomeConfigResolved> {
	const allConfigPaths = await getAllBiomeConfigPaths(configPath);
	return loadBiomeConfigs(allConfigPaths);
}

/**
 * Loads a set of Biome configs, such as that returned by {@link getAllBiomeConfigPaths}. The configs are loaded
 * recursively and the results are merged. Array-type values are not merged, in accordance with how Biome applies
 * configs.
 */
async function loadBiomeConfigs(allConfigPaths: string[]): Promise<BiomeConfigResolved> {
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

	return mergedConfig as BiomeConfigResolved;
}

export type BiomeIncludeIgnore = "include" | "ignore";
export type BiomeConfigSection = "formatter" | "linter";

/**
 * Given a Biome config object, returns the combined settings for 'ignore' and 'include' across the 'files', 'formatter'
 * and 'linter' sections in the config.
 */
export function getSettingValuesFromBiomeConfig(
	config: BiomeConfigResolved,
	section: BiomeConfigSection,
	kind: BiomeIncludeIgnore,
): Set<string> {
	const generalFiles = config.files?.[kind] ?? [];
	const sectionFiles = config?.[section]?.[kind] ?? [];
	return new Set([...generalFiles, ...sectionFiles]);
}

/**
 * Returns the absolute path to the closest Biome config file found from the current working directory up to the root
 * of the repo.
 *
 * @throws If a Biome config file cannot be found.
 */
export async function getClosestBiomeConfigPath(
	cwd: string,
	stopAt?: string,
): Promise<string> {
	return (await findUp)
		.findUp(["biome.json", "biome.jsonc"], { cwd, stopAt })
		.then((config) => {
			if (config === undefined) {
				throw new Error(`Can't find biome config file`);
			}
			return config;
		});
}

/**
 * Return an array of absolute paths to files that Biome would format under the provided path. Note that .gitignored
 * paths are always excluded, regardless of the "vcs" setting in the Biome configuration.
 *
 * @param directoryOrConfigFile - A path to a directory or a Biome config file. If a directory is provided, then the
 * closest Biome configuration will be loaded and used. If a path to a file is provided, it is assumed to be a Biome
 * config file and will be loaded as such. The directory containing the config file will be used as the working
 * directory when applying the Biome include/ignore settings.
 * @param gitRepo - A GitRepo instance that is used to enumerate files.
 */
export async function getBiomeFormattedFilesFromDirectory(
	directoryOrConfigFile: string,
	gitRepo: GitRepo,
): Promise<string[]> {
	/**
	 * The repo root-relative path to the directory being used as the Biome working directory.
	 */
	let directory: string;
	let configFile: string;
	if ((await stat(directoryOrConfigFile)).isFile()) {
		configFile = directoryOrConfigFile;
		directory = path.relative(gitRepo.resolvedRoot, path.dirname(directoryOrConfigFile));
	} else {
		configFile = await getClosestBiomeConfigPath(directoryOrConfigFile);
		directory = path.relative(gitRepo.resolvedRoot, directoryOrConfigFile);
	}
	const config = await loadBiomeConfig(configFile);
	return getBiomeFormattedFiles(config, directory, gitRepo);
}

/**
 * Return an array of absolute paths to files that Biome would format under the provided path. Note that .gitignored
 * paths are always excluded, regardless of the "vcs" setting in the Biome configuration.
 *
 * @param config - A resolved/merged Biome config.
 * @param directory - The directory containing files to be formatted.
 * @param gitRepo - A GitRepo instance that is used to enumerate files.
 */
export async function getBiomeFormattedFiles(
	config: BiomeConfigResolved,
	directory: string,
	gitRepo: GitRepo,
): Promise<string[]> {
	const [includeEntries, ignoreEntries] = await Promise.all([
		getSettingValuesFromBiomeConfig(config, "formatter", "include"),
		getSettingValuesFromBiomeConfig(config, "formatter", "ignore"),
	]);

	// From the Biome docs (https://biomejs.dev/guides/how-biome-works/#include-and-ignore-explained):
	//
	// "At the moment, Biome uses a glob library that treats all globs as having a **/ prefix.
	// This means that src/**/*.js and **/src/**/*.js are treated as identical. They match both src/file.js and
	// test/src/file.js. This is something we plan to fix in Biome v2.0.0."
	const prefixedIncludes = [...includeEntries].map((glob) => `**/${glob}`);
	const prefixedIgnores = [...ignoreEntries].map((glob) => `**/${glob}`);

	/**
	 * All files that could possibly be formatted before Biome include and ignore entries are applied. Paths are relative
	 * to the root of the repo.
	 */
	const gitLsFiles = new Set(await gitRepo.getFiles(directory));

	/**
	 * An array of repo-relative paths to files included via the 'include' settings in the Biome config.
	 */
	const includedPaths =
		prefixedIncludes.length > 0
			? // If there are includes, then we filter the possible files using the include globs
				multimatch([...gitLsFiles], prefixedIncludes)
			: // No Biome includes were provided, so we include everything git enumerated
				[...gitLsFiles];

	const ignoreObject = ignore().add(prefixedIgnores);
	// Note that ignoreObject.filter expects the paths to be relative to the repo root.
	const filtered = ignoreObject.filter(includedPaths);

	// Convert repo root-relative paths to absolute paths
	const repoRoot = gitRepo.resolvedRoot;
	return filtered.map((filePath) => path.resolve(repoRoot, filePath));
}

/**
 * A class used to simplify access to a Biome config when you want to just load a config and get the file list and
 * config details. Given a directory and a GitRepo instance, the class calculates and caches the configs and formatted
 * files. Using this class can be more convenient than using the free functions, especially when you need access to all
 * the configs and formatted files.
 */
export class BiomeConfigReader {
	public get closestConfig(): string {
		assert(
			this.allConfigs.length > 0,
			"BiomeConfigLoader.allConfigs must be initialized before getting the closestConfig.",
		);
		// The closest config is the last one in the list of configs, because they're sorted in the order they're applied.
		// We previously asserted that there is at least one element in the array
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.allConfigs.at(-1)!;
	}

	public readonly directory: string;

	private constructor(
		configFile: string,
		public readonly allConfigs: string[],
		public readonly mergedConfig: BiomeConfigResolved,
		public readonly formattedFiles: string[],
	) {
		this.directory = path.dirname(configFile);
	}
	/**
	 * Create a BiomeConfig instance rooted in the provided directory.
	 */
	public static async create(
		directoryOrConfigFile: string,
		gitRepo: GitRepo,
	): Promise<BiomeConfigReader> {
		/**
		 * The repo root-relative path to the directory being used as the Biome working directory.
		 */
		let directory: string;
		let configFile: string;
		if ((await stat(directoryOrConfigFile)).isFile()) {
			configFile = directoryOrConfigFile;
			directory = path.relative(gitRepo.resolvedRoot, path.dirname(directoryOrConfigFile));
		} else {
			configFile = await getClosestBiomeConfigPath(directoryOrConfigFile);
			directory = path.relative(gitRepo.resolvedRoot, directoryOrConfigFile);
		}

		const allConfigs = await getAllBiomeConfigPaths(configFile);
		const mergedConfig = await loadBiomeConfigs(allConfigs);
		const files = await getBiomeFormattedFiles(mergedConfig, directory, gitRepo);
		return new BiomeConfigReader(configFile, allConfigs, mergedConfig, files);
	}
}
