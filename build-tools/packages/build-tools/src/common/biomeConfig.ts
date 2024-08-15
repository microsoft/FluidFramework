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
import type { Configuration as BiomeConfigOnDisk } from "./biomeConfigTypes";
import type { GitRepo } from "./gitRepo";

// switch to regular import once building ESM
const findUp = import("find-up");

/**
 * Loads a Biome configuration file _without_ following any 'extends' values. You probably want to use
 * {@link loadBiomeConfig} instead of this function.
 */
async function loadRawBiomeConfig(configPath: string): Promise<BiomeConfigOnDisk> {
	const contents = await readFile(configPath, "utf8");
	const config: BiomeConfigOnDisk = JSON5.parse(contents);
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
 */
export async function loadBiomeConfig(configPath: string): Promise<BiomeConfigOnDisk> {
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

export type BiomeIncludeIgnore = "include" | "ignore";
export type BiomeConfigSection = "formatter" | "linter";

/**
 * Given a Biome config object, returns the combined settings for 'ignore' and 'include' across the 'files', 'formatter'
 * and 'linter' sections in the config.
 */
export async function getSettingValuesFromBiomeConfig(
	config: BiomeConfigOnDisk,
	section: BiomeConfigSection,
	kind: BiomeIncludeIgnore,
): Promise<Set<string>> {
	// TODO: Remove this commented code once test cases have been added with file extension filtering -- this code is
	// helpful because it forces everything to be included regardless of other filters - so it can be used to verify the
	// new file extension filtering tests.
	// const generalFiles = config.files?.[kind] ?? (kind === "include" ? ["**"] : []);
	// const sectionFiles = config?.[section]?.[kind] ?? (kind === "include" ? ["**"] : []);
	const generalFiles = config.files?.[kind] ?? [];
	const sectionFiles = config?.[section]?.[kind] ?? [];
	return new Set([...generalFiles, ...sectionFiles]);
}

/**
 * Returns the absolute path to the closest Biome config file found from the current working directory up to the root
 * of the repo.
 */
export async function getClosestBiomeConfigPath(
	cwd: string,
	stopAt?: string,
): Promise<string | undefined> {
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
export async function getBiomeFormattedFiles(
	directoryOrConfigFile: string,
	gitRepo: GitRepo,
): Promise<string[]> {
	let configFile: string | undefined;
	/**
	 * The repo-relative path to the directory being used as the Biome working directory.
	 */
	const directory: string = path.relative(
		gitRepo.resolvedRoot,
		path.dirname(directoryOrConfigFile),
	);

	if ((await stat(directoryOrConfigFile)).isFile()) {
		configFile = directoryOrConfigFile;
	} else {
		configFile = await getClosestBiomeConfigPath(directoryOrConfigFile);
	}

	if (configFile === undefined) {
		throw new Error("Cannot find a Biome config file.");
	}

	const config = await loadBiomeConfig(configFile);
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

	// Convert directory-relative paths to absolute
	const repoRoot = gitRepo.resolvedRoot;
	return filtered.map((filePath) => path.resolve(repoRoot, filePath));
}

/**
 * A class used to simplify access to a BiomeConfig. Given a directory and a GitRepo instance, the class calculates and
 * caches the configs and formatted files. Using this class can be more convenient than using the free functions,
 * especially when you need access to all the configs and formatted files.
 */
export class BiomeConfig {
	private _allConfigs: string[] | undefined;
	public get allConfigs(): string[] {
		return this._allConfigs ?? [];
	}

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

	private _formattedFiles: string[] = [];
	public get formattedFiles(): string[] {
		return this._formattedFiles;
	}

	private constructor(public readonly directory: string) {}

	/**
	 * Create a BiomeConfig instance rooted in the provided directory.
	 */
	public static async create(directory: string, gitRepo: GitRepo): Promise<BiomeConfig> {
		const config = new BiomeConfig(directory);
		const initialConfig = await getClosestBiomeConfigPath(directory);
		if (initialConfig === undefined) {
			throw new Error(`No Biome config found in ${directory}`);
		}

		config._allConfigs = await getAllBiomeConfigPaths(initialConfig);
		const files = await getBiomeFormattedFiles(initialConfig, gitRepo);
		config._formattedFiles.push(...files);
		return config;
	}
}
