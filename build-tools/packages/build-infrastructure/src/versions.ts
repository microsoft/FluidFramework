/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InterdependencyRange } from "@fluid-tools/version-tools";
import * as semver from "semver";

import { updatePackageJsonFile } from "./packageJsonUtils.js";
import type { IPackage, PackageJson } from "./types.js";

/**
 * Sets the version of a group of packages.
 *
 * Note that any loaded objects such as an IFluidRepo instance may need to be reloaded after calling this function.
 *
 * @param fluidRepo - The {@link IFluidRepo}.
 * @param packages - An array of objects whose version should be updated.
 * @param version - The version to set.
 */
export async function setVersion<J extends PackageJson>(
	packages: IPackage[],
	version: semver.SemVer,
): Promise<void> {
	const translatedVersion = version;
	for (const pkg of packages) {
		updatePackageJsonFile<J>(pkg.directory, (json) => {
			json.version = translatedVersion.version;
		});
	}
}

/**
 *
 * Note that any loaded objects such as an IFluidRepo instance may need to be reloaded after calling this function.
 *
 * @param packages - Packages whose dependencies should be updated.
 * @param dependencyNames - The names of the dependencies that should be modified.
 * @param dependencyRange - The new dependency range to use.
 */
export async function setDependencyVersion(
	packages: IPackage[],
	dependencyNames: string[],
	dependencyRange: InterdependencyRange,
): Promise<void> {
	const depRangeToSet =
		typeof dependencyRange === "string" ? dependencyRange : dependencyRange.version;

	const dependenciesToUpdate: ReadonlySet<string> = new Set(dependencyNames);
	const savePromises: Promise<void>[] = [];
	for (const pkg of packages) {
		for (const { name, depClass } of pkg.combinedDependencies) {
			if (!dependenciesToUpdate.has(name)) {
				continue;
			}

			switch (depClass) {
				case "dev": {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					pkg.packageJson.devDependencies![name] = depRangeToSet;
					break;
				}

				case "peer": {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					pkg.packageJson.peerDependencies![name] = depRangeToSet;
					break;
				}

				case "prod": {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					pkg.packageJson.dependencies![name] = depRangeToSet;
					break;
				}

				default: {
					throw new Error(`Unknown dependency type: ${depClass}`);
				}
			}
		}
		savePromises.push(pkg.savePackageJson());
	}

	await Promise.all(savePromises);
}
