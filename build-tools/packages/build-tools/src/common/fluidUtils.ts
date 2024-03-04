/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as childProcess from "node:child_process";
import * as path from "node:path";
import { existsSync } from "node:fs";
import { cosmiconfigSync } from "cosmiconfig";
import findUp from "find-up";

import { commonOptions } from "./commonOptions";
import { IFluidBuildConfig } from "./fluidRepo";
import { realpathAsync } from "./utils";
import { readJson } from "fs-extra";
import { getPackages } from "@manypkg/get-packages";

import registerDebug from "debug";
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
	const config = await findUp("fluidBuild.config.cjs", {
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
			traceInit(`Error getting packages: ${e}`);
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
	return await realpathAsync(resolvedRoot);
}

/**
 * A cosmiconfig explorer to find the fluidBuild config. First looks for javascript config files and falls back to the
 * fluidBuild property in package.json. We create a single explorer here because cosmiconfig internally caches configs
 * for performance. The cache is per-explorer, so re-using the same explorer is a minor perf improvement.
 */
const configExplorer = cosmiconfigSync("fluidBuild", {
	searchPlaces: [`fluidBuild.config.cjs`, `fluidBuild.config.js`, "package.json"],
	packageProp: "fluidBuild",
});

/**
 * Loads an IFluidBuildConfig from the fluidBuild property in a package.json file, or from fluidBuild.config.[c]js.
 * Throw if not found.
 *
 * @param rootDir - The path to the root package.json to load.
 * @param noCache - If true, the config cache will be cleared and the config will be reloaded.
 * @returns The fluidBuild section of the package.json.
 */
export function loadFluidBuildConfig(rootDir: string, noCache = false): IFluidBuildConfig {
	const config = getFluidBuildConfig(rootDir, noCache);
	if (config === undefined) {
		throw new Error(`Error loading config.`);
	}
	return config;
}

/**
 * Get an IFluidBuildConfig from the fluidBuild property in a package.json file, or from fluidBuild.config.[c]js.
 *
 * @param rootDir - The path to the root package.json to load.
 * @param noCache - If true, the config cache will be cleared and the config will be reloaded.
 * @returns The fluidBuild section of the package.json, or undefined if not found
 */
export function getFluidBuildConfig(rootDir: string, noCache = false): IFluidBuildConfig {
	if (noCache === true) {
		configExplorer.clearCaches();
	}

	const config = configExplorer.search(rootDir);
	return config?.config;
}
