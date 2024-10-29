/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as semver from "semver";

import { updatePackageJsonFileAsync } from "./packageJsonUtils.js";
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
	const setPackagePromises: Promise<void>[] = [];
	for (const pkg of packages) {
		setPackagePromises.push(
			updatePackageJsonFileAsync<J>(pkg.directory, async (json) => {
				json.version = translatedVersion.version;
			}),
		);
	}
	await Promise.all(setPackagePromises);
}
