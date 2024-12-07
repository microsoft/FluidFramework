/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { cosmiconfigSync } from "cosmiconfig";

import { defaultLogger } from "../common/logging";
import { FLUIDBUILD_CONFIG_VERSION, type IFluidBuildConfig } from "./fluidBuildConfig";

const configName = "fluidBuild";

/**
 * A cosmiconfig explorer to find the fluidBuild config. First looks for JavaScript config files and falls back to the
 * `fluidBuild` property in package.json. We create a single explorer here because cosmiconfig internally caches configs
 * for performance. The cache is per-explorer, so re-using the same explorer is a minor perf improvement.
 */
const configExplorer = cosmiconfigSync(configName, {
	searchPlaces: [`${configName}.config.cjs`, `${configName}.config.js`, "package.json"],
	packageProp: [configName],
});

/**
 * Get an IFluidBuildConfig from the fluidBuild property in a package.json file, or from fluidBuild.config.[c]js.
 *
 * @param rootDir - The path to the root package.json to load.
 * @param noCache - If true, the config cache will be cleared and the config will be reloaded.
 * @returns The fluidBuild section of the package.json, or undefined if not found
 */
export function getFluidBuildConfig(
	rootDir: string,
	noCache = false,
	log = defaultLogger,
): { config: IFluidBuildConfig; configFilePath: string } {
	if (noCache === true) {
		configExplorer.clearCaches();
	}

	const configResult = configExplorer.search(rootDir);
	const config = configResult?.config as IFluidBuildConfig | undefined;

	if (config === undefined || configResult === null) {
		throw new Error("No fluidBuild configuration found.");
	}

	if (config.version === undefined) {
		log.warning(
			"fluidBuild config has no version field. This field will be required in a future release.",
		);
		config.version = FLUIDBUILD_CONFIG_VERSION;
	}

	// Only version 1 of the config is supported. If any other value is provided, throw an error.
	if (config.version !== FLUIDBUILD_CONFIG_VERSION) {
		throw new Error(
			`Configuration version is not supported: ${config?.version}. Config version must be ${FLUIDBUILD_CONFIG_VERSION}.`,
		);
	}
	return { config, configFilePath: configResult.filepath };
}
