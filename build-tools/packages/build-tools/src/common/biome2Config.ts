/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import ignore from "ignore";
import * as JSON5 from "json5";
import multimatch from "multimatch";
import { merge } from "ts-deepmerge";
import type { Opaque } from "type-fest";

import type { Configuration2 as Biome2ConfigRaw } from "./biome2ConfigTypes";
import type { GitRepo } from "./gitRepo";

// switch to regular import once building ESM
const findUp = import("find-up");

/**
 * Convenience type to represent a Biome 2.x config that has been loaded while following and merging the
 * "extends" values. This helps differentiate between the single loaded configs and the fully resolved config.
 */
export type Biome2ConfigResolved = Opaque<Biome2ConfigRaw, "Biome2ConfigResolved">;

/**
 * Loads a Biome 2.x configuration file _without_ following any 'extends' values. You probably want to use
 * {@link loadBiome2Configs} instead of this function.
 */
async function loadRawBiome2Config(configPath: string): Promise<Biome2ConfigRaw> {
	const contents = await readFile(configPath, "utf8");
	const config: Biome2ConfigRaw = JSON5.parse(contents);
	return config;
}

/**
 * Returns an array of absolute paths to Biome 2.x config files. The paths are in the order in which they are merged by
 * Biome. That is, the last item in the array will be the absolute path to `configPath`.
 *
 * In Biome 2.x, configs are resolved by:
 * 1. Following explicit `extends` declarations
 * 2. Walking up the directory tree to find parent configs until a config with `root: true` is found
 *
 * Both mechanisms are supported and combined.
 */
export async function getAllBiome2ConfigPaths(configPath: string): Promise<string[]> {
	const config = await loadRawBiome2Config(configPath);
	let extendedConfigPaths: string[] = [];

	// First, handle explicit extends declarations
	if (config.extends) {
		const pathsNested = await Promise.all(
			config.extends.map((configToExtend) =>
				getAllBiome2ConfigPaths(path.join(path.dirname(configPath), configToExtend)),
			),
		);
		extendedConfigPaths = pathsNested.flat();
	}

	// If this config doesn't have root: true and doesn't have explicit extends,
	// walk up the directory tree to find parent configs
	if (config.root !== true && !config.extends) {
		const parentConfigs = await findParentBiome2Configs(path.dirname(configPath));
		extendedConfigPaths = [...parentConfigs, ...extendedConfigPaths];
	}

	// Add the current config as the last one to be applied when they're merged
	extendedConfigPaths.push(configPath);
	return extendedConfigPaths;
}

/**
 * Walks up the directory tree from the given directory to find parent Biome config files.
 * Stops when a config with `root: true` is found or when the filesystem root is reached.
 *
 * @returns Array of config paths in order from root to nearest parent (not including the starting directory)
 */
async function findParentBiome2Configs(startDir: string): Promise<string[]> {
	const configs: string[] = [];
	let currentDir = path.dirname(startDir); // Start from parent of the starting directory
	const fsRoot = path.parse(startDir).root;

	while (currentDir !== fsRoot) {
		const configPath = await findBiome2ConfigInDirectory(currentDir);
		if (configPath) {
			const config = await loadRawBiome2Config(configPath);
			// Insert at the beginning since we want root configs first
			configs.unshift(configPath);

			// If this config has root: true, stop walking up
			if (config.root === true) {
				break;
			}
		}
		currentDir = path.dirname(currentDir);
	}

	return configs;
}

/**
 * Looks for a Biome config file in the given directory.
 * @returns The path to the config file if found, undefined otherwise.
 */
async function findBiome2ConfigInDirectory(dir: string): Promise<string | undefined> {
	const possibleNames = ["biome.json", "biome.jsonc"];
	for (const name of possibleNames) {
		const configPath = path.join(dir, name);
		try {
			await stat(configPath);
			return configPath;
		} catch {
			// File doesn't exist, try next
		}
	}
	return undefined;
}

/**
 * Loads a Biome 2.x configuration file. If the config extends others or has parent configs in the directory tree,
 * those are loaded recursively and the results are merged. Array-type values are not merged, in accordance with
 * how Biome applies configs.
 *
 * @remarks
 *
 * The intent is to merge the configs in the same way that Biome itself does, but the implementation is based on the
 * Biome documentation, so there may be subtle differences unaccounted for. Where this implementation diverges from
 * Biome's behavior, this function should be considered incorrect.
 *
 * Relevant Biome documentation: {@link https://biomejs.dev/guides/big-projects/}
 */
export async function loadBiome2Config(configPath: string): Promise<Biome2ConfigResolved> {
	const allConfigPaths = await getAllBiome2ConfigPaths(configPath);
	return loadBiome2Configs(allConfigPaths);
}

/**
 * Loads a set of Biome 2.x configs, such as that returned by {@link getAllBiome2ConfigPaths}. The configs are loaded
 * recursively and the results are merged. Array-type values are not merged, in accordance with how Biome applies
 * configs.
 */
async function loadBiome2Configs(allConfigPaths: string[]): Promise<Biome2ConfigResolved> {
	const allConfigs = await Promise.all(
		allConfigPaths.map((pathToConfig) => loadRawBiome2Config(pathToConfig)),
	);

	const mergedConfig = merge.withOptions(
		{
			// Biome does not merge arrays
			mergeArrays: false,
		},
		...allConfigs,
	);

	return mergedConfig as Biome2ConfigResolved;
}

export type Biome2ConfigSection = "formatter" | "linter";

/**
 * Parses a Biome 2.x 'includes' array and separates it into include patterns and ignore (negated) patterns.
 *
 * In Biome 2.x, the 'includes' field uses a unified syntax where:
 * - Regular patterns (e.g., "src/**") indicate files to include
 * - Negated patterns (prefixed with `!`, e.g., "!node_modules/**") indicate files to exclude
 *
 * @param includes - The includes array from a Biome 2.x configuration
 * @returns An object with separate arrays for include and ignore patterns (ignore patterns have the `!` prefix removed)
 */
export function parseIncludes(includes: string[] | undefined | null): {
	includePatterns: string[];
	ignorePatterns: string[];
} {
	const includePatterns: string[] = [];
	const ignorePatterns: string[] = [];

	if (!includes) {
		return { includePatterns, ignorePatterns };
	}

	for (const pattern of includes) {
		if (pattern.startsWith("!")) {
			// Remove the `!` prefix for the ignore pattern
			ignorePatterns.push(pattern.slice(1));
		} else {
			includePatterns.push(pattern);
		}
	}

	return { includePatterns, ignorePatterns };
}

/**
 * Given a Biome 2.x config object, returns the combined settings for 'includes' across the 'files'
 * and the specified section ('formatter' or 'linter') in the config.
 *
 * This function parses the unified 'includes' field and returns separate include and ignore patterns.
 */
export function getSettingValuesFromBiome2Config(
	config: Biome2ConfigResolved,
	section: Biome2ConfigSection,
): {
	includePatterns: Set<string>;
	ignorePatterns: Set<string>;
} {
	// Parse files.includes
	const filesIncludes = parseIncludes(config.files?.includes);

	// Parse section-specific includes
	const sectionIncludes = parseIncludes(config?.[section]?.includes);

	// Combine patterns from both sections
	return {
		includePatterns: new Set([
			...filesIncludes.includePatterns,
			...sectionIncludes.includePatterns,
		]),
		ignorePatterns: new Set([
			...filesIncludes.ignorePatterns,
			...sectionIncludes.ignorePatterns,
		]),
	};
}

/**
 * Returns the absolute path to the closest Biome config file found from the current working directory up to the root
 * of the repo.
 *
 * @throws If a Biome config file cannot be found.
 */
export async function getClosestBiome2ConfigPath(
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
 * Return an array of absolute paths to files that Biome 2.x would format under the provided path. Note that .gitignored
 * paths are always excluded, regardless of the "vcs" setting in the Biome configuration.
 *
 * @param directoryOrConfigFile - A path to a directory or a Biome config file. If a directory is provided, then the
 * closest Biome configuration will be loaded and used. If a path to a file is provided, it is assumed to be a Biome
 * config file and will be loaded as such. The directory containing the config file will be used as the working
 * directory when applying the Biome include/ignore settings.
 * @param gitRepo - A GitRepo instance that is used to enumerate files.
 */
export async function getBiome2FormattedFilesFromDirectory(
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
		configFile = await getClosestBiome2ConfigPath(directoryOrConfigFile);
		directory = path.relative(gitRepo.resolvedRoot, directoryOrConfigFile);
	}
	const config = await loadBiome2Config(configFile);
	return getBiome2FormattedFiles(config, directory, gitRepo);
}

/**
 * Return an array of absolute paths to files that Biome 2.x would format under the provided path. Note that .gitignored
 * paths are always excluded, regardless of the "vcs" setting in the Biome configuration.
 *
 * @param config - A resolved/merged Biome 2.x config.
 * @param directory - The directory containing files to be formatted.
 * @param gitRepo - A GitRepo instance that is used to enumerate files.
 */
export async function getBiome2FormattedFiles(
	config: Biome2ConfigResolved,
	directory: string,
	gitRepo: GitRepo,
): Promise<string[]> {
	const { includePatterns, ignorePatterns } = getSettingValuesFromBiome2Config(
		config,
		"formatter",
	);

	// In Biome 2.x, globs are resolved from the configuration file location.
	// However, since we're matching against repo-root-relative paths from git,
	// we need to prepend **/ to the patterns to match anywhere in the path.
	// This is similar to how Biome 1.x handled patterns implicitly.
	// We avoid double-prefixing patterns that already start with **/.
	const prefixGlob = (glob: string): string => (glob.startsWith("**/") ? glob : `**/${glob}`);
	const prefixedIncludes = [...includePatterns].map(prefixGlob);
	const prefixedIgnores = [...ignorePatterns].map(prefixGlob);

	/**
	 * All files that could possibly be formatted before Biome include and ignore entries are applied. Paths are relative
	 * to the root of the repo.
	 */
	const gitLsFiles = new Set(await gitRepo.getFiles(directory));

	/**
	 * An array of repo-relative paths to files included via the 'includes' patterns in the Biome 2.x config.
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
 * A class used to simplify access to a Biome 2.x config when you want to just load a config and get the file list and
 * config details. Given a directory and a GitRepo instance, the class calculates and caches the configs and formatted
 * files. Using this class can be more convenient than using the free functions, especially when you need access to all
 * the configs and formatted files.
 *
 * The key difference from BiomeConfigReader (for 1.x) is that this class handles the unified 'includes' field
 * with negation pattern support, instead of separate 'include' and 'ignore' fields.
 */
export class Biome2ConfigReader {
	public get closestConfig(): string {
		assert(
			this.allConfigs.length > 0,
			"Biome2ConfigReader.allConfigs must be initialized before getting the closestConfig.",
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
		public readonly mergedConfig: Biome2ConfigResolved,
		public readonly formattedFiles: string[],
	) {
		this.directory = path.dirname(configFile);
	}
	/**
	 * Create a Biome2ConfigReader instance rooted in the provided directory.
	 */
	public static async create(
		directoryOrConfigFile: string,
		gitRepo: GitRepo,
	): Promise<Biome2ConfigReader> {
		/**
		 * The repo root-relative path to the directory being used as the Biome working directory.
		 */
		let directory: string;
		let configFile: string;
		if ((await stat(directoryOrConfigFile)).isFile()) {
			configFile = directoryOrConfigFile;
			directory = path.relative(gitRepo.resolvedRoot, path.dirname(directoryOrConfigFile));
		} else {
			configFile = await getClosestBiome2ConfigPath(directoryOrConfigFile);
			directory = path.relative(gitRepo.resolvedRoot, directoryOrConfigFile);
		}

		const allConfigs = await getAllBiome2ConfigPaths(configFile);
		const mergedConfig = await loadBiome2Configs(allConfigs);
		const files = await getBiome2FormattedFiles(mergedConfig, directory, gitRepo);
		return new Biome2ConfigReader(configFile, allConfigs, mergedConfig, files);
	}
}
