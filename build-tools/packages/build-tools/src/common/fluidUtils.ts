/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as path from "path";

import { commonOptions } from "./commonOptions";
import { IFluidBuildConfig } from "./fluidRepo";
import { defaultLogger } from "./logging";
import { existsSync, lookUpDirAsync, readJsonAsync, readJsonSync, realpathAsync } from "./utils";

const { verbose } = defaultLogger;

async function isFluidRootLerna(dir: string) {
	const filename = path.join(dir, "lerna.json");
	if (!existsSync(filename)) {
		verbose(`InferRoot: lerna.json not found`);
		return false;
	}
	const rootPackageManifest = await getFluidBuildConfig(dir);
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

	const parsed = await readJsonAsync(filename);
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
 * Loads an IFluidBuildConfig from a package.json file in a directory.
 *
 * @param rootDir - The path to the root package.json to load.
 * @returns The fluidBuild section of the package.json.
 */
export function getFluidBuildConfig(rootDir: string): IFluidBuildConfig {
	const jsonPath = path.join(rootDir, "package.json");
	if (!existsSync(jsonPath)) {
		throw new Error(`Root package.json not found in: ${rootDir}`);
	}
	const pkgJson = readJsonSync(jsonPath);
	return pkgJson?.fluidBuild;
}
