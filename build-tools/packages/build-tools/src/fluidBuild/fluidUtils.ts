/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as childProcess from "node:child_process";
import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import * as path from "node:path";
import { getPackages } from "@manypkg/get-packages";
import { cosmiconfigSync } from "cosmiconfig";
import registerDebug from "debug";
import { readJson } from "fs-extra";

import { defaultLogger } from "../common/logging";
import { commonOptions } from "./commonOptions";
import {
	DEFAULT_FLUIDBUILD_CONFIG,
	FLUIDBUILD_CONFIG_VERSION,
	type IFluidBuildConfig,
} from "./fluidBuildConfig";

// switch to regular import once building ESM
const findUp = import("find-up");

const traceInit = registerDebug("fluid-build:init");

async function isFluidRootPackage(dir: string) {
	const filename = path.join(dir, "package.json");
	if (!existsSync(filename)) {
		traceInit(`InferRoot: package.json not found`);
		return false;
	}

	const parsed = await readJson(filename);
	if (parsed.private === true) {
		return true;
	}
	traceInit(`InferRoot: package.json not matched`);
	return false;
}

async function inferRoot(buildRoot: boolean) {
	const config = await (await findUp).findUp("fluidBuild.config.cjs", {
		cwd: process.cwd(),
		type: "file",
	});
	if (config !== undefined) {
		return path.dirname(config);
	}

	traceInit(`No fluidBuild.config.cjs found. Falling back to git root.`);
	try {
		// Use the git root as a fallback for older branches where the fluidBuild config is still in
		// package.json
		const gitRoot = childProcess
			.execSync("git rev-parse --show-toplevel", {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			})
			.trim();

		const gitRootPackageJson = path.join(gitRoot, "package.json");
		if (existsSync(gitRootPackageJson)) {
			if (!buildRoot) {
				return gitRoot;
			}
			// For build root, we require it to have fluidBuild property.
			const parsed = await readJson(gitRootPackageJson);
			if (parsed.fluidBuild !== undefined) {
				return gitRoot;
			}
		}
	} catch (e) {
		traceInit(`Error getting git root: ${e}`);
	}

	if (buildRoot) {
		// For fluid-build, just use the enclosing workspace or package if exists
		try {
			traceInit(`No git root found. Trying enclosing workspace/package`);
			const { rootDir } = await getPackages(process.cwd());
			return rootDir;
		} catch (e) {
			traceInit(`Error getting workspace packages: ${e}`);
		}
	}

	return undefined;
}

async function inferFluidRoot(buildRoot: boolean) {
	const rootDir = await inferRoot(buildRoot);
	if (rootDir === undefined) {
		return undefined;
	}

	// build root doesn't require the root to be a private package
	return buildRoot || (await isFluidRootPackage(rootDir)) ? rootDir : undefined;
}

export async function getResolvedFluidRoot(buildRoot = false) {
	let checkFluidRoot = true;
	let root = commonOptions.root;
	if (root) {
		traceInit(`Using argument root @ ${root}`);
	} else {
		root = await inferFluidRoot(buildRoot);
		if (root) {
			checkFluidRoot = false;
			traceInit(`Using inferred root @ ${root}`);
		} else if (commonOptions.defaultRoot) {
			root = commonOptions.defaultRoot;
			traceInit(`Using default root @ ${root}`);
		} else {
			throw new Error(
				`Unknown repo root. Specify it with --root or environment variable _FLUID_ROOT_`,
			);
		}
	}

	if (checkFluidRoot && !isFluidRootPackage(root)) {
		throw new Error(`'${root}' is not a root of Fluid repo.`);
	}

	const resolvedRoot = path.resolve(root);
	if (!existsSync(resolvedRoot)) {
		throw new Error(`Repo root '${resolvedRoot}' does not exist.`);
	}

	// Use realpath.native to get the case-sensitive path on windows
	return await realpath(resolvedRoot);
}

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
 * Contains directories previously used to start search but where we didn't find an explicit fluidBuild config file.
 * This allows avoiding repeated searches for config.
 */
const defaultSearchDir = new Set<string>();

/**
 * Get an IFluidBuildConfig from the fluidBuild property in a package.json file, or from fluidBuild.config.[c]js.
 *
 * @param searchDir - The path to search for the config. The search will look up the folder hierarchy for a config in
 * either a standalone file or package.json
 * @param warnNotFound - Whether to warn if no fluidBuild config is found.
 * @returns The the loaded fluidBuild config, or the default config if one is not found.
 */
export function getFluidBuildConfig(
	searchDir: string,
	warnNotFound = true,
	log = defaultLogger,
): IFluidBuildConfig {
	if (defaultSearchDir.has(searchDir)) {
		return DEFAULT_FLUIDBUILD_CONFIG;
	}

	const configResult = configExplorer.search(searchDir);
	if (configResult?.config === undefined) {
		if (warnNotFound) {
			log.warning(
				`No fluidBuild config found when searching ${searchDir}; default configuration loaded. Packages and tasks will be inferred.`,
			);
		}
		defaultSearchDir.add(searchDir);
		return DEFAULT_FLUIDBUILD_CONFIG;
	}

	const config = configResult.config;
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
	return config;
}
