/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import ignore from "ignore";
import * as JSON5 from "json5";
import multimatch from "multimatch";

import type { GitRepo } from "./gitRepo";

// switch to regular import once building ESM
const findUp = import("find-up");

/**
 * Minimal interface for a Biome configuration that includes the extends field.
 * This is used for shared config loading logic between Biome 1.x and 2.x.
 * In Biome 2.x, extends can be a string or string[]. In Biome 1.x, it's only string[].
 */
export interface BiomeConfigWithExtends {
	extends?: string[] | string | null;
}

/**
 * Loads a Biome configuration file from disk and parses it as JSON5.
 * This function does not follow any 'extends' values.
 *
 * @param configPath - The absolute path to the config file.
 * @returns The parsed configuration object.
 */
export async function loadRawBiomeConfigFile<T extends BiomeConfigWithExtends>(
	configPath: string,
): Promise<T> {
	const contents = await readFile(configPath, "utf8");
	const config = JSON5.parse(contents) as T;
	return config;
}

/**
 * Recursively resolves the extends chain for a given config file.
 * Returns an array of config paths in the order they should be merged (base configs first).
 *
 * @param configPath - The path to the config file
 * @param loadConfig - Function to load a raw config (used to read the extends field)
 * @param includeConfigPath - Whether to include the config itself in the result (default: true)
 * @returns Array of config paths in merge order
 */
export async function resolveExtendsChainGeneric<T extends BiomeConfigWithExtends>(
	configPath: string,
	loadConfig: (path: string) => Promise<T>,
	includeConfigPath = true,
): Promise<string[]> {
	const config = await loadConfig(configPath);
	let extendedConfigPaths: string[] = [];

	if (config.extends) {
		// Normalize extends to always be an array (Biome 2.x allows string or string[])
		const extendsArray = Array.isArray(config.extends) ? config.extends : [config.extends];
		const pathsNested = await Promise.all(
			extendsArray.map((configToExtend) =>
				resolveExtendsChainGeneric(
					path.join(path.dirname(configPath), configToExtend),
					loadConfig,
					true, // Always include in recursive calls
				),
			),
		);
		extendedConfigPaths = pathsNested.flat();
	}

	if (includeConfigPath) {
		extendedConfigPaths.push(configPath);
	}

	return extendedConfigPaths;
}

/**
 * Returns the absolute path to the closest Biome config file found from the current working directory up to the root
 * of the repo. This function works for both Biome 1.x and 2.x configs since they use the same file names.
 *
 * @param cwd - The current working directory to start the search from.
 * @param stopAt - Optional directory to stop the search at.
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
 * Filters files from git using include and ignore patterns.
 * This is shared logic used by both Biome 1.x and 2.x config readers.
 *
 * @param includePatterns - Patterns to include files. If empty, all files from git are included.
 * @param ignorePatterns - Patterns to exclude files from the included set.
 * @param directory - The repo-root-relative directory to enumerate files from.
 * @param gitRepo - A GitRepo instance that is used to enumerate files.
 * @param prefixGlob - Optional function to transform patterns (e.g., prepend "**\/").
 * @returns Array of absolute paths to files that match the patterns.
 */
export async function filterFilesWithPatterns(
	includePatterns: Set<string>,
	ignorePatterns: Set<string>,
	directory: string,
	gitRepo: GitRepo,
	prefixGlob?: (glob: string) => string,
): Promise<string[]> {
	// Apply prefix function if provided
	const prefixedIncludes = prefixGlob
		? [...includePatterns].map(prefixGlob)
		: [...includePatterns];
	const prefixedIgnores = prefixGlob
		? [...ignorePatterns].map(prefixGlob)
		: [...ignorePatterns];

	// Get all files from git (these are already filtered by .gitignore)
	const gitLsFiles = new Set(await gitRepo.getFiles(directory));

	// Apply include patterns
	const includedPaths =
		prefixedIncludes.length > 0
			? multimatch([...gitLsFiles], prefixedIncludes)
			: [...gitLsFiles];

	// Apply ignore patterns
	const ignoreObject = ignore().add(prefixedIgnores);
	const filtered = ignoreObject.filter(includedPaths);

	// Convert repo root-relative paths to absolute paths
	const repoRoot = gitRepo.resolvedRoot;
	return filtered.map((filePath) => path.resolve(repoRoot, filePath));
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
export async function filterFilesWithOrderedPatterns(
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

	// Start with files matching initial includes (or all files if no initial includes)
	let result: Set<string>;
	if (initialIncludes.length > 0) {
		result = new Set(multimatch(allFiles, initialIncludes));
	} else {
		result = new Set(allFiles);
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
