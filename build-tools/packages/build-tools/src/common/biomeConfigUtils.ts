/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import * as JSON5 from "json5";

/**
 * Minimal interface for a Biome configuration that includes the extends field.
 * This is used for shared config loading logic between Biome 1.x and 2.x.
 */
export interface BiomeConfigWithExtends {
	extends?: string[] | null;
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
		const pathsNested = await Promise.all(
			config.extends.map((configToExtend) =>
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
