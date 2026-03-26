/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Shared utilities for Biome 1.x and 2.x configuration handling.
 */

import { readFile } from "node:fs/promises";
import * as JSON5 from "json5";

import type { GitRepo } from "./gitRepo";

// find-up is an ESM-only package and we're still building CJS, so this import form is required
// so that TypeScript won't transpile it to require(). Once this package is switched to ESM, then
// this can be a standard import.
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
 * A common interface for both Biome 1.x and 2.x config readers.
 * This interface defines the properties that are available on both readers.
 */
export interface BiomeConfigReader {
	/**
	 * The absolute path to the closest (most specific) config file.
	 */
	readonly closestConfig: string;
	/**
	 * The directory containing the config file.
	 */
	readonly directory: string;
	/**
	 * All config file paths, in order of application (base configs first).
	 */
	readonly allConfigs: string[];
	/**
	 * Absolute paths to files that would be formatted by Biome.
	 */
	readonly formattedFiles: string[];
}

/**
 * Creates the appropriate BiomeConfigReader based on the detected Biome version.
 *
 * This factory function auto-detects whether Biome 1.x or 2.x is installed and returns
 * the appropriate config reader. Use this function when you want automatic version detection.
 *
 * @param directoryOrConfigFile - A path to a directory or a Biome config file.
 * @param gitRepo - A GitRepo instance that is used to enumerate files.
 * @param forceVersion - If provided, forces the use of a specific Biome version reader
 *                       instead of auto-detecting.
 * @returns A BiomeConfigReader (for 1.x) or Biome2ConfigReader (for 2.x) based on the detected version.
 */
export async function createBiomeConfigReader(
	directoryOrConfigFile: string,
	gitRepo: GitRepo,
	forceVersion?: 1 | 2,
): Promise<BiomeConfigReader> {
	// Import lazily to avoid circular dependencies
	const { BiomeConfigReaderV1 } = await import("./biomeConfig.js");
	const { Biome2ConfigReader } = await import("./biome2Config.js");
	const { detectBiomeVersion } = await import("./biomeVersion.js");

	let majorVersion: 1 | 2;

	if (forceVersion !== undefined) {
		majorVersion = forceVersion;
	} else {
		// Auto-detect the Biome version
		const versionInfo = await detectBiomeVersion(directoryOrConfigFile);
		majorVersion = versionInfo?.majorVersion ?? 1; // Default to 1.x if detection fails
	}

	if (majorVersion === 2) {
		return Biome2ConfigReader.create(directoryOrConfigFile, gitRepo);
	}

	// Default to Biome 1.x reader
	return BiomeConfigReaderV1.create(directoryOrConfigFile, gitRepo);
}
