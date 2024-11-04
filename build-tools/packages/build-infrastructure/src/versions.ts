/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SemVer } from "semver";

import { updatePackageJsonFileAsync } from "./packageJsonUtils.js";
import type { IPackage, PackageJson } from "./types.js";

/**
 * Sets the version of a group of packages, writing the new version in package.json. After the update, the packages are
 * reloaded so the in-memory data reflects the version changes.
 *
 * @param packages - An array of objects whose version should be updated.
 * @param version - The version to set.
 */
export async function setVersion<J extends PackageJson>(
	packages: IPackage<J>[],
	version: SemVer,
): Promise<void> {
	const translatedVersion = version;
	const setPackagePromises: Promise<void>[] = [];
	for (const pkg of packages) {
		setPackagePromises.push(
			updatePackageJsonFileAsync<J>(pkg.directory, async (json) => {
				json.version = translatedVersion.version;
			}),
		);
	}
	await Promise.all(setPackagePromises);

	// Reload all the packages to refresh the in-memory data
	for (const pkg of packages) {
		pkg.reload();
	}
}
