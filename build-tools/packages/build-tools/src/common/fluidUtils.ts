/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as path from "node:path";
import { existsSync } from "node:fs";
import { cosmiconfigSync } from "cosmiconfig";

import { commonOptions } from "./commonOptions";
import { IFluidBuildConfig } from "./fluidRepo";
import { defaultLogger } from "./logging";
import { lookUpDirAsync, realpathAsync } from "./utils";
import { readJson } from "fs-extra";

const { verbose } = defaultLogger;

async function isFluidRootLerna(dir: string) {
	const filename = path.join(dir, "lerna.json");
	if (!existsSync(filename)) {
		verbose(`InferRoot: lerna.json not found`);
		return false;
	}
	const rootPackageManifest = getFluidBuildConfig(dir);
	if (
		rootPackageManifest.repoPackages.server !== undefined &&
		!existsSync(path.join(dir, rootPackageManifest.repoPackages.server as string, "lerna.json"))
	) {
		verbose(
			`InferRoot: ${dir}/${
				rootPackageManifest.repoPackages.server as string
			}/lerna.json not found`,
		);
		return false;
	}

	return true;
}

async function isFluidRootPackage(dir: string) {
	const filename = path.join(dir, "package.json");
	if (!existsSync(filename)) {
		verbose(`InferRoot: package.json not found`);
		return false;
	}

	const parsed = await readJson(filename);
	if (parsed.name === "root" && parsed.private === true) {
		return true;
	}
	verbose(`InferRoot: package.json not matched`);
	return false;
}

async function isFluidRoot(dir: string) {
	return (await isFluidRootLerna(dir)) && (await isFluidRootPackage(dir));
}

async function inferRoot() {
	return lookUpDirAsync(process.cwd(), async (curr) => {
		verbose(`InferRoot: probing ${curr}`);
		try {
			if (await isFluidRoot(curr)) {
				return true;
			}
			// eslint-disable-next-line no-empty
		} catch {}
		return false;
	});
}

export async function getResolvedFluidRoot() {
	let checkFluidRoot = true;
	let root = commonOptions.root;
	if (root) {
		verbose(`Using argument root @ ${root}`);
	} else {
		root = await inferRoot();
		if (root) {
			checkFluidRoot = false;
			verbose(`Using inferred root @ ${root}`);
		} else if (commonOptions.defaultRoot) {
			root = commonOptions.defaultRoot;
			verbose(`Using default root @ ${root}`);
		} else {
			console.error(
				`ERROR: Unknown repo root. Specify it with --root or environment variable _FLUID_ROOT_`,
			);
			process.exit(-101);
		}
	}

	if (checkFluidRoot && !isFluidRoot(root)) {
		console.error(`ERROR: '${root}' is not a root of Fluid repo.`);
		process.exit(-100);
	}

	const resolvedRoot = path.resolve(root);
	if (!existsSync(resolvedRoot)) {
		console.error(`ERROR: Repo root '${resolvedRoot}' does not exist.`);
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
