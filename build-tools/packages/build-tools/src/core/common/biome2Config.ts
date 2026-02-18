/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import { stat } from "node:fs/promises";
import path from "node:path";
import ignore from "ignore";
import multimatch from "multimatch";
import { merge } from "ts-deepmerge";
import type { Opaque } from "type-fest";

import type { Configuration as Biome2ConfigRaw } from "./biome2ConfigTypes";
import { getClosestBiomeConfigPath, loadRawBiomeConfigFile } from "./biomeConfigUtils";
import type { GitRepo } from "./gitRepo";

/**
 * Convenience type to represent a Biome 2.x config that has been loaded while following and merging the
 * "extends" values. This helps differentiate between the single loaded configs and the fully resolved config.
 */
export type Biome2ConfigResolved = Opaque<Biome2ConfigRaw, "Biome2ConfigResolved">;

/**
 * Loads a Biome 2.x configuration file _without_ following any 'extends' values. You probably want to use
 * {@link loadBiome2Config} instead of this function.
 */
async function loadRawBiome2Config(configPath: string): Promise<Biome2ConfigRaw> {
	return loadRawBiomeConfigFile<Biome2ConfigRaw>(configPath);
}

/**
 * Resolves a single extends value for Biome 2.x, handling the special "//" microsyntax.
 * The "//" syntax means "find and extend the root config" by walking up the directory tree.
 *
 * @param configPath - The path to the config file that has the extends declaration
 * @param extendsValue - The extends value to resolve (can be "//" or a relative path)
 * @returns The absolute path to the config file being extended
 */
async function resolveBiome2ExtendsPath(
	configPath: string,
	extendsValue: string,
): Promise<string> {
	// Handle the special "//" microsyntax for Biome 2.x
	if (extendsValue === "//") {
		// Find the root config by walking up from the parent directory
		const rootConfig = await findRootBiome2Config(path.dirname(configPath));
		if (!rootConfig) {
			throw new Error(
				`Could not find root Biome config (with "root": true) when resolving "extends": "//" from ${configPath}`,
			);
		}
		return rootConfig;
	}

	// For regular relative paths, resolve relative to the config's directory
	return path.join(path.dirname(configPath), extendsValue);
}

/**
 * Recursively resolves the extends chain for a Biome 2.x config file.
 * Returns an array of config paths in the order they should be merged (base configs first).
 * Handles the special "//" microsyntax that tells Biome to extend from the root config.
 *
 * @param configPath - The path to the config file
 * @param includeConfigPath - Whether to include the config itself in the result (default: true)
 * @param visitedPaths - Set of already visited paths to detect circular extends (internal use)
 * @returns Array of config paths in merge order
 * @throws Error if a circular extends chain is detected
 */
async function resolveBiome2ExtendsChain(
	configPath: string,
	includeConfigPath = true,
	visitedPaths: Set<string> = new Set(),
): Promise<string[]> {
	// Normalize the path for consistent comparison
	const normalizedPath = path.resolve(configPath);

	// Check for circular extends
	if (visitedPaths.has(normalizedPath)) {
		const chain = [...visitedPaths, normalizedPath].join(" -> ");
		throw new Error(`Circular extends detected in Biome config chain: ${chain}`);
	}

	// Add current path to visited set
	visitedPaths.add(normalizedPath);

	const config = await loadRawBiome2Config(configPath);
	let extendedConfigPaths: string[] = [];

	if (config.extends) {
		// Normalize extends to always be an array (Biome 2.x allows string or string[])
		const extendsArray = Array.isArray(config.extends) ? config.extends : [config.extends];
		const pathsNested = await Promise.all(
			extendsArray.map(async (configToExtend) => {
				// Resolve the extends path (handles "//" microsyntax)
				const resolvedPath = await resolveBiome2ExtendsPath(configPath, configToExtend);
				// Recursively resolve the chain for this extended config, passing the visited set
				return resolveBiome2ExtendsChain(resolvedPath, true, new Set(visitedPaths));
			}),
		);
		extendedConfigPaths = pathsNested.flat();
	}

	if (includeConfigPath) {
		extendedConfigPaths.push(configPath);
	}

	return extendedConfigPaths;
}

/**
 * Returns an array of absolute paths to Biome 2.x config files that affect the given config.
 * The paths are returned in merge order (base configs first, most specific last), with the last item being
 * the absolute path to `configPath` itself.
 *
 * @remarks
 *
 * **Observed Biome 2.x behavior (tested with Biome 2.3.8):**
 *
 * Config inheritance ONLY happens via explicit `extends` declarations. Without `extends`:
 * - A nested config (even with `root: false`) operates independently
 * - It uses only its own settings plus Biome's defaults
 * - Parent configs in the directory tree are NOT automatically merged
 *
 * For example, given this structure:
 * ```
 * /project/biome.json        (root: true, indentStyle: "space")
 * /project/child/biome.json  (root: false, lineWidth: 80)
 * ```
 *
 * When formatting files in `/project/child/`, Biome uses the child config with:
 * - `lineWidth: 80` (from child)
 * - `indentStyle: "tab"` (Biome's DEFAULT, NOT inherited from parent)
 *
 * To inherit from the parent, the child must explicitly use `extends`:
 * - `"extends": "//"` - extend from the root config (nearest ancestor with `root: true`)
 * - `"extends": ["../biome.json"]` - extend from a specific path
 *
 * This function follows Biome's behavior: it only includes configs explicitly in the `extends` chain.
 */
export async function getAllBiome2ConfigPaths(configPath: string): Promise<string[]> {
	// Only follow explicit extends declarations - Biome does not automatically merge parent configs
	const extendedConfigPaths = await resolveBiome2ExtendsChain(configPath, false);

	// Add the current config as the last one to be applied when they're merged
	extendedConfigPaths.push(configPath);
	return extendedConfigPaths;
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
 * Finds the root Biome config file by walking up the directory tree from the given starting directory.
 * The root config is identified by having `"root": true` in its configuration.
 *
 * @param startDir - The directory to start searching from (typically the directory of the child config).
 * @returns The absolute path to the root config file, or undefined if no root config is found.
 */
export async function findRootBiome2Config(startDir: string): Promise<string | undefined> {
	let currentDir = startDir;
	const fsRoot = path.parse(startDir).root;

	while (currentDir !== fsRoot) {
		const configPath = await findBiome2ConfigInDirectory(currentDir);
		if (configPath) {
			const config = await loadRawBiome2Config(configPath);
			if (config.root === true) {
				return configPath;
			}
		}
		currentDir = path.dirname(currentDir);
	}

	return undefined;
}

/**
 * Loads a Biome 2.x configuration file by following all `extends` declarations and merging
 * the results. Array-type values are not merged, in accordance with how Biome applies configs.
 *
 * @param configPath - Absolute path to a Biome 2.x configuration file.
 * @returns The fully resolved and merged configuration.
 *
 * @remarks
 *
 * This function follows Biome's config resolution behavior: only configs explicitly referenced
 * via `extends` are merged. Without `extends`, a config operates independently.
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
 * Note: This function is intentionally separate from the similar `loadBiomeConfigs` in biomeConfig.ts
 * to maintain type safety between Biome 1.x and 2.x config types. The merging logic is identical,
 * but the different type signatures (BiomeConfigRaw vs Biome2ConfigRaw) and opaque return types
 * provide compile-time guarantees that prevent mixing 1.x and 2.x configs accidentally.
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

type Biome2ConfigSection = "formatter" | "linter";

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
	let directory: string;
	let configFile: string;
	const pathStats = await stat(directoryOrConfigFile);

	if (pathStats.isFile()) {
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
 * Filters files from git using ordered patterns from Biome 2.x config.
 * Patterns are processed in declaration order, supporting re-inclusion patterns.
 *
 * In Biome 2.x, the 'includes' field uses a unified syntax where:
 * - Regular patterns (e.g., "src/**") indicate files to include
 * - Negated patterns (prefixed with `!`, e.g., "!node_modules/**") indicate files to exclude
 *
 * Patterns are processed in order, allowing for complex re-inclusion patterns like:
 * `["**", "!test/**", "test/special/**"]` which means:
 * 1. Include all files (**)
 * 2. Exclude test/** (!test/**)
 * 3. Re-include test/special/** (test/special/**)
 *
 * @param orderedPatterns - Array of patterns in declaration order (with ! prefix for exclusions)
 * @param directory - The repo-root-relative directory to enumerate files from.
 * @param gitRepo - A GitRepo instance that is used to enumerate files.
 * @param prefixGlob - Optional function to transform patterns (e.g., prepend "**\/").
 * @returns Array of absolute paths to files that match the patterns.
 */
async function filterFilesWithOrderedPatterns(
	orderedPatterns: string[],
	directory: string,
	gitRepo: GitRepo,
	prefixGlob?: (glob: string) => string,
): Promise<string[]> {
	// Get all files from git (these are already filtered by .gitignore)
	const allFiles = await gitRepo.getFiles(directory);

	// Apply prefix function if provided
	const prefixedPatterns = prefixGlob ? orderedPatterns.map(prefixGlob) : orderedPatterns;

	// Find the first exclusion pattern to separate initial includes from the rest
	const firstExclusionIndex = prefixedPatterns.findIndex((p) => p.startsWith("!"));

	// If no exclusions, just apply includes
	if (firstExclusionIndex === -1) {
		const filtered =
			prefixedPatterns.length > 0 ? multimatch(allFiles, prefixedPatterns) : allFiles;
		const repoRoot = gitRepo.resolvedRoot;
		return filtered.map((filePath) => path.resolve(repoRoot, filePath));
	}

	// Get initial include patterns (before first exclusion)
	const initialIncludes = prefixedPatterns.slice(0, firstExclusionIndex);
	const restPatterns = prefixedPatterns.slice(firstExclusionIndex);

	// Start with files matching initial includes (or empty set if no initial includes)
	// Per Biome docs: "When using a negated pattern, you should always specify ** first to match all files"
	// If the first pattern is an exclusion with no prior includes, we start with an empty set.
	let result: Set<string>;
	if (initialIncludes.length > 0) {
		result = new Set(multimatch(allFiles, initialIncludes));
	} else {
		result = new Set();
	}

	// Process remaining patterns in order
	for (const pattern of restPatterns) {
		if (pattern.startsWith("!")) {
			// Exclusion: remove matching files from result
			const exclusionPattern = pattern.slice(1);
			const ig = ignore().add([exclusionPattern]);
			const toRemove = [...result].filter((f) => ig.ignores(f));
			for (const f of toRemove) {
				result.delete(f);
			}
		} else {
			// Re-inclusion: add back matching files from original set using multimatch
			const toAdd = multimatch(allFiles, [pattern]);
			for (const f of toAdd) {
				result.add(f);
			}
		}
	}

	// Convert repo root-relative paths to absolute paths
	const repoRoot = gitRepo.resolvedRoot;
	return [...result].map((filePath) => path.resolve(repoRoot, filePath));
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

	/**
	 * The directory containing the closest (most specific) config file.
	 */
	public readonly directory: string;

	/**
	 * @param configFile - Absolute path to the closest Biome config file
	 * @param allConfigs - All config file paths, in order of application (base configs first)
	 * @param mergedConfig - The fully resolved and merged configuration
	 * @param formattedFiles - Absolute paths to files that would be formatted
	 */
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
	 *
	 * @param directoryOrConfigFile - A path to a directory or a Biome config file
	 * @param gitRepo - A GitRepo instance used to enumerate files
	 */
	public static async create(
		directoryOrConfigFile: string,
		gitRepo: GitRepo,
	): Promise<Biome2ConfigReader> {
		let configFile: string;
		let directory: string;

		const pathStats = await stat(directoryOrConfigFile);
		if (pathStats.isFile()) {
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
