/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import globby from "globby";
import ignore from "ignore";
import * as JSON5 from "json5";
import { merge } from "ts-deepmerge";
import type { Configuration as BiomeConfig } from "./biomeConfigTypes";
import type { GitRepo } from "./gitRepo";

// switch to regular import once building ESM
const findUp = import("find-up");

/**
 * Loads a Biome configuration file _without_ following any 'extends' values. You probably want to use
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
export async function loadBiomeConfig(configPath: string): Promise<BiomeConfig> {
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
	config: BiomeConfig,
	section: BiomeConfigSection,
	kind: BiomeIncludeIgnore,
): Promise<Set<string>> {
	if (section === "formatter" && kind === "ignore") {
		const filesIgnore = config.files?.ignore ?? [];
		const formatterIgnores = config.formatter?.ignore ?? [];
		return new Set([...filesIgnore, ...formatterIgnores]);
	}

	if (section === "formatter" && kind === "include") {
		const filesInclude = config.files?.include ?? [];
		const formatterIncludes = config.formatter?.include ?? [];
		return new Set([...filesInclude, ...formatterIncludes]);
	}

	if (section === "linter" && kind === "ignore") {
		const filesIgnore = config.files?.ignore ?? [];
		const linterIgnores = config.linter?.ignore ?? [];
		return new Set([...filesIgnore, ...linterIgnores]);
	}

	if (section === "linter" && kind === "include") {
		const filesInclude = config.files?.include ?? [];
		const linterIncludes = config.linter?.include ?? [];
		return new Set([...filesInclude, ...linterIncludes]);
	}

	return new Set<string>();
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
 * Return an array of absolute paths to files that Biome would format under the provided path. Paths ignored by git are
 * always excluded.
 */
export async function getBiomeFormattedFiles(
	directoryOrConfigFile: string,
	gitRepo: GitRepo,
): Promise<string[]> {
	let configFile: string | undefined;
	let directory: string;

	if ((await stat(directoryOrConfigFile)).isFile()) {
		configFile = directoryOrConfigFile;
		directory = path.dirname(directoryOrConfigFile);
	} else {
		configFile = await getClosestBiomeConfigPath(directoryOrConfigFile);
		directory = directoryOrConfigFile;
	}

	/**
	 * All files that could possibly be formatted before ignore entries are applied. Paths are relative to the root of
	 * the repo.
	 */
	const allPossibleFiles = new Set(await gitRepo.getFiles(directory));

	if (configFile === undefined) {
		// No config, so all files are formatted
		return [...allPossibleFiles];
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
	 * An array of cwd-relative paths to files included via the 'include' settings in the Biome config.
	 */
	const includedPaths = await globby(prefixedIncludes, {
		// We need to interpret the globs from the provided directory; the paths returned will be relative to this path
		cwd: directory,

		// Don't return directories, only files; Biome includes are only applied to files.
		// See note at https://biomejs.dev/guides/how-biome-works/#include-and-ignore-explained
		onlyFiles: true,
	});

	const ignoreObject = ignore().add([...prefixedIgnores]);
	const filtered = ignoreObject.filter([...includedPaths]);

	// Convert directory-relative paths to absolute
	const repoRoot = gitRepo.resolvedRoot;
	return filtered.map((filePath) => path.resolve(repoRoot, directory, filePath));
}
