/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IPackage } from "@fluid-tools/build-infrastructure";
import type { InterdependencyRange } from "@fluid-tools/version-tools";
import semver from "semver";

/**
 * Sets the dependency range for a group of packages given a group of dependencies to update.
 * The changes are written to package.json. After the update, the packages are
 * reloaded so the in-memory data reflects the version changes.
 *
 * @param packagesToUpdate - A list of objects whose version should be updated.
 * @param dependencies - A list of objects that the packagesToUpdate depend on that should have updated ranges.
 * @param dependencyRange - The new version range to set for the packageToUpdate dependencies.
 */
export async function setDependencyRange<P extends IPackage>(
	packagesToUpdate: Iterable<P>,
	dependencies: Iterable<P>,
	dependencyRange: InterdependencyRange,
): Promise<void> {
	const dependencySet = new Set(Array.from(dependencies, (d) => d.name));
	// collect the "save" promises to resolve in parallel
	const savePromises: Promise<void>[] = [];

	for (const pkg of packagesToUpdate) {
		for (const { name: depName, depKind } of pkg.combinedDependencies) {
			if (dependencySet.has(depName)) {
				const depRange =
					typeof dependencyRange === "string"
						? dependencyRange
						: dependencyRange instanceof semver.SemVer
							? dependencyRange.version
							: undefined;

				// Check if depRange is defined
				if (depRange === undefined) {
					throw new Error(`Invalid dependency range: ${dependencyRange}`);
				}

				// Update the version in packageJson
				if (depKind === "prod" && pkg.packageJson.dependencies !== undefined) {
					pkg.packageJson.dependencies[depName] = depRange;
				} else if (depKind === "dev" && pkg.packageJson.devDependencies !== undefined) {
					pkg.packageJson.devDependencies[depName] = depRange;
				} else if (depKind === "peer" && pkg.packageJson.peerDependencies !== undefined) {
					pkg.packageJson.peerDependencies[depName] = depRange;
				}
			}
		}
		savePromises.push(pkg.savePackageJson());
	}
	await Promise.all(savePromises);

	// Reload all packages to refresh the in-memory data
	for (const pkg of packagesToUpdate) {
		pkg.reload();
	}
}
