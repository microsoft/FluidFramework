/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import { stat } from "node:fs/promises";
import path from "node:path";
import { merge } from "ts-deepmerge";
import type { Opaque } from "type-fest";

import type { Configuration as Biome2ConfigRaw } from "./biome2ConfigTypes";
import {
	filterFilesWithOrderedPatterns,
	getClosestBiomeConfigPath,
	loadRawBiomeConfigFile,
	resolveExtendsChainGeneric,
} from "./biomeConfigUtils";
import type { GitRepo } from "./gitRepo";

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
	return loadRawBiomeConfigFile<Biome2ConfigRaw>(configPath);
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
		// Get only the extended configs, not configPath itself (we'll add it at the end)
		extendedConfigPaths = await resolveExtendsChainGeneric(
			configPath,
			loadRawBiome2Config,
			false,
		);
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
 * Stops when a config with `root: true` is found, when the stopAt directory is reached,
 * or when the filesystem root is reached.
 * For each parent config found, recursively resolves any `extends` declarations.
 *
 * @param startDir - The directory containing the child config file. Parent discovery starts
 *                   from this directory's parent (i.e., startDir itself is not searched).
 * @param stopAt - Optional directory path to stop searching at. Typically the git repo root.
 *                 If not provided, the search continues until `root: true` is found or filesystem root is reached.
 *                 Note: This parameter is currently not passed from `getAllBiome2ConfigPaths()`, but the function
 *                 properly stops at `root: true` which is the standard Biome behavior.
 * @returns Array of config paths in order from root to nearest parent (not including the starting directory),
 *          with all extends chains resolved
 */
async function findParentBiome2Configs(startDir: string, stopAt?: string): Promise<string[]> {
	// Use find-up to locate parent configs, stopping at the specified directory
	const foundConfigs: string[] = [];
	let currentDir = path.dirname(startDir);
	const fsRoot = path.parse(startDir).root;
	const stopAtNormalized = stopAt ? path.normalize(stopAt) : undefined;

	while (currentDir !== fsRoot) {
		// Stop if we've reached the stopAt directory
		if (stopAtNormalized && path.normalize(currentDir) === stopAtNormalized) {
			break;
		}

		const configPath = await findBiome2ConfigInDirectory(currentDir);
		if (configPath) {
			const config = await loadRawBiome2Config(configPath);

			// Recursively resolve any extends for this parent config using shared utility
			const parentConfigPaths = await resolveExtendsChainGeneric(
				configPath,
				loadRawBiome2Config,
			);

			// Add to the list (we'll reverse at the end)
			foundConfigs.push(...parentConfigPaths);

			// If this config has root: true, stop walking up
			if (config.root === true) {
				break;
			}
		}
		currentDir = path.dirname(currentDir);
	}

	// Reverse to get root-to-child order
	return foundConfigs.reverse();
}

/**
 * Looks for a Biome config file in the given directory by checking for known config file names.
 *
 * @param dir - The directory to search in.
 * @returns The absolute path to the config file if found, undefined otherwise.
 */
async function findBiome2ConfigInDirectory(dir: string): Promise<string | undefined> {
	const configNames = ["biome.json", "biome.jsonc"];

	for (const name of configNames) {
		const configPath = path.join(dir, name);
		try {
			await stat(configPath);
			return configPath;
		} catch {
			// File doesn't exist, continue to next name
		}
	}
	return undefined;
}

/**
 * Loads a Biome 2.x configuration file by following all `extends` declarations and parent config
 * discovery, then merging the results. Array-type values are not merged, in accordance with
 * how Biome applies configs.
 *
 * @param configPath - Absolute path to a Biome 2.x configuration file.
 * @returns The fully resolved and merged configuration.
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
	return mergeMultipleBiome2Configs(allConfigPaths);
}

/**
 * Loads and merges multiple Biome 2.x config files in the specified order.
 * Configs are merged sequentially, with later configs overriding earlier ones.
 * Array-type values are not merged, in accordance with how Biome applies configs.
 *
 * @param configPaths - Array of absolute paths to config files, ordered from base to most specific.
 *                      Each config's values will override those from earlier configs.
 * @returns The merged configuration.
 */
async function mergeMultipleBiome2Configs(
	configPaths: string[],
): Promise<Biome2ConfigResolved> {
	const allConfigs = await Promise.all(
		configPaths.map((pathToConfig) => loadRawBiome2Config(pathToConfig)),
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
 * Given a Biome 2.x config object, returns the ordered patterns from 'includes' across the 'files'
 * and the specified section ('formatter' or 'linter') in the config.
 *
 * Patterns are returned in declaration order, which is essential for correct re-inclusion behavior.
 * In Biome 2.x, patterns like `["**", "!test/**", "test/special/**"]` are processed in order:
 * 1. Include all files (**)
 * 2. Exclude test/** (!test/**)
 * 3. Re-include test/special/** (test/special/**)
 *
 * See: {@link https://biomejs.dev/reference/configuration/#filesinclude}
 *
 * @param config - A resolved/merged Biome 2.x configuration.
 * @param section - The config section to extract patterns from ('formatter' or 'linter').
 * @returns An array of patterns in declaration order, with negation prefixes preserved.
 */
export function getOrderedPatternsFromBiome2Config(
	config: Biome2ConfigResolved,
	section: Biome2ConfigSection,
): string[] {
	const patterns: string[] = [];

	// Add patterns from files.includes first
	if (config.files?.includes) {
		patterns.push(...config.files.includes);
	}

	// Add section-specific patterns
	const sectionConfig = config[section];
	if (sectionConfig?.includes) {
		patterns.push(...sectionConfig.includes);
	}

	return patterns;
}

/**
 * Given a Biome 2.x config object, returns the combined settings for 'includes' across the 'files'
 * and the specified section ('formatter' or 'linter') in the config.
 *
 * This function parses the unified 'includes' field and returns separate include and ignore patterns.
 *
 * @deprecated Use {@link getOrderedPatternsFromBiome2Config} instead for correct re-inclusion pattern handling.
 *
 * @param config - A resolved/merged Biome 2.x configuration.
 * @param section - The config section to extract patterns from ('formatter' or 'linter').
 * @returns An object with Sets of include and ignore patterns (ignore patterns have the `!` prefix removed).
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
		configFile = await getClosestBiomeConfigPath(directoryOrConfigFile);
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
	const orderedPatterns = getOrderedPatternsFromBiome2Config(config, "formatter");

	// KNOWN LIMITATION: In Biome 2.x, globs are resolved relative to the configuration file location.
	// However, since we're matching against repo-root-relative paths from git, we prepend **/ to
	// patterns to match anywhere in the path (similar to Biome 1.x behavior).
	//
	// This approach may OVERMATCH files (i.e., include more files than Biome would), which could cause
	// unnecessary cache invalidation. However, it will NOT UNDERMATCH (miss files that should be cached),
	// so this is a safe trade-off for our caching use case.
	//
	// To fully replicate Biome 2.x behavior, we would need to:
	// 1. Track which config file each pattern originates from
	// 2. Compute the relative path from config file location to repo root
	// 3. Apply patterns relative to their source config's directory
	//
	// We avoid double-prefixing patterns that already start with **/.
	const prefixGlob = (glob: string): string => {
		const isNegation = glob.startsWith("!");
		const pattern = isNegation ? glob.slice(1) : glob;
		const prefixed = pattern.startsWith("**/") ? pattern : `**/${pattern}`;
		return isNegation ? `!${prefixed}` : prefixed;
	};

	return filterFilesWithOrderedPatterns(orderedPatterns, directory, gitRepo, prefixGlob);
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
			configFile = await getClosestBiomeConfigPath(directoryOrConfigFile);
			directory = path.relative(gitRepo.resolvedRoot, directoryOrConfigFile);
		}

		const allConfigs = await getAllBiome2ConfigPaths(configFile);
		const mergedConfig = await mergeMultipleBiome2Configs(allConfigs);
		const files = await getBiome2FormattedFiles(mergedConfig, directory, gitRepo);
		return new Biome2ConfigReader(configFile, allConfigs, mergedConfig, files);
	}
}
