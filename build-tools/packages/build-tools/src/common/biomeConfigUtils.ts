/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Shared utilities for Biome 1.x and 2.x configuration handling.
 */

import { readFile } from "node:fs/promises";
import * as JSON5 from "json5";

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
