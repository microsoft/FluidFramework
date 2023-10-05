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
import { Logger, defaultLogger } from "./logging";
import { realpathAsync } from "./utils";
import { readJson } from "fs-extra";

/**
 * This function checks that there is a lerna.json file in root of the client and server release groups.
 *
 * Long term we want to get rid of this file, since we no longer use lerna. However, that is a larger change that will
 * be done later. For now, the file must be in the root for both the client and server release groups.
 *
 * Client is needed because it's the root of the repo, and server needs it because the server CI pipeline is built using
 * docker, and the docker context is rooted at the release group root, so it doesn't have access to any files outside
 * the root of the server release group.
 */
async function isFluidRootLerna(dir: string, log: Logger = defaultLogger) {
	const filename = path.join(dir, "lerna.json");
	if (!existsSync(filename)) {
		log.verbose(`InferRoot: lerna.json not found`);
		return false;
	}
	const rootPackageManifest = getFluidBuildConfig(dir);
	if (rootPackageManifest.repoPackages.server !== undefined) {
		if (Array.isArray(rootPackageManifest.repoPackages.server)) {
			log.warning(
				`InferRoot: fluid-build settings for the server release group are an array, which is not expected.`,
			);
			return false;
		}

		const serverPath =
			typeof rootPackageManifest.repoPackages.server === "string"
				? rootPackageManifest.repoPackages.server
				: rootPackageManifest.repoPackages.server.directory;

		if (!existsSync(path.join(dir, serverPath, "lerna.json"))) {
			log.verbose(`InferRoot: ${dir}/${serverPath}/lerna.json not found`);
			return false;
		}
	}

	return true;
}

async function isFluidRootPackage(dir: string, log: Logger = defaultLogger) {
	const filename = path.join(dir, "package.json");
	if (!existsSync(filename)) {
		log.verbose(`InferRoot: package.json not found`);
		return false;
	}

	const parsed = await readJson(filename);
	if (parsed.name === "root" && parsed.private === true) {
		return true;
	}
	log.verbose(`InferRoot: package.json not matched`);
	return false;
}

async function isFluidRoot(dir: string) {
	return (await isFluidRootLerna(dir)) && (await isFluidRootPackage(dir));
}

async function inferRoot(log: Logger = defaultLogger) {
	let fluidConfig = findUp.sync("fluidBuild.config.cjs", { cwd: process.cwd(), type: "file" });
	if (fluidConfig === undefined) {
		log?.verbose(`No fluidBuild.config.cjs found. Falling back to git root.`);
		// Use the git root as a fallback for older branches where the fluidBuild config is still in
		// package.json
		const gitRoot = childProcess
			.execSync("git rev-parse --show-toplevel", { encoding: "utf8" })
			.trim();
		fluidConfig = path.join(gitRoot, "package.json");
		if (fluidConfig === undefined || !existsSync(fluidConfig)) {
			return undefined;
		}
	}
	const isRoot = await isFluidRootPackage(path.dirname(fluidConfig), log);
	if (isRoot) {
		return path.dirname(fluidConfig);
	}

	return undefined;
}

export async function getResolvedFluidRoot(log: Logger = defaultLogger) {
	let checkFluidRoot = true;
	let root = commonOptions.root;
	if (root) {
		log.verbose(`Using argument root @ ${root}`);
	} else {
		root = await inferRoot(log);
		if (root) {
			checkFluidRoot = false;
			log.verbose(`Using inferred root @ ${root}`);
		} else if (commonOptions.defaultRoot) {
			root = commonOptions.defaultRoot;
			log.verbose(`Using default root @ ${root}`);
		} else {
			log.errorLog(
				`Unknown repo root. Specify it with --root or environment variable _FLUID_ROOT_`,
			);
			process.exit(-101);
		}
	}

	if (checkFluidRoot && !isFluidRoot(root)) {
		log.errorLog(`'${root}' is not a root of Fluid repo.`);
		process.exit(-100);
	}

	const resolvedRoot = path.resolve(root);
	if (!existsSync(resolvedRoot)) {
		log.errorLog(`Repo root '${resolvedRoot}' does not exist.`);
		process.exit(-102);
	}

	// Use realpath.native to get the case-sensitive path on windows
	return await realpathAsync(resolvedRoot);
}

/**
 * A cosmiconfig explorer to find the fluidBuild config. First looks for javascript config files and falls back to the
 * fluidBuild propert in package.json. We create a single explorer here because cosmiconfig internally caches configs
 * for performance. The cache is per-explorer, so re-using the same explorer is a minor perf improvement.
 */
const configExplorer = cosmiconfigSync("fluidBuild", {
	searchPlaces: [`fluidBuild.config.cjs`, `fluidBuild.config.js`, "package.json"],
	packageProp: "fluidBuild",
});

/**
 * Loads an IFluidBuildConfig from the fluidBuild property in a package.json file, or from fluidBuild.config.[c]js.
 *
 * @param rootDir - The path to the root package.json to load.
 * @param noCache - If true, the config cache will be cleared and the config will be reloaded.
 * @returns The fluidBuild section of the package.json.
 */
export function getFluidBuildConfig(rootDir: string, noCache = false): IFluidBuildConfig {
	if (noCache === true) {
		configExplorer.clearCaches();
	}

	const config = configExplorer.search(rootDir);
	if (config?.config === undefined) {
		throw new Error(`Error loading config.`);
	}
	return config.config;
}
