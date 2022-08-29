/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MonoRepo, Package, VersionBag } from "@fluidframework/build-tools";
import { bumpRange, isVersionBumpTypeExtended } from "@fluid-tools/version-tools";
import * as semver from "semver";

/** A mapping of {@link Package} to a version range string or a bump type. This interface is used for convenience. */
export interface PackageWithRangeSpec {
    pkg: Package;
    rangeOrBumpType: string;
}

/**
 * Bump the dependencies of a package according to the provided map of packages to bump types.
 *
 * @param pkg - The package whose dependencies should be bumped.
 * @param bumpPackageMap - A Map of package names to a {@link PackageWithRangeSpec} which contains the package and a
 * string that is either a range string or a bump type. If it is a range string, the dependency will be set to that
 * value. If it is a bump type, the dependency range will be bumped according to that type.
 * @param prerelease - If true, will bump to the next pre-release version given the bump type.
 * @param onlyBumpPrerelease - If true, only dependencies on pre-release packages will be bumped.
 * @param changedVersions - If provided, the changed packages will be put into this {@link VersionBag}.
 * @returns True if the packages dependencies were changed; false otherwise.
 */
// eslint-disable-next-line max-params
export async function bumpPackageDependencies(
    pkg: Package,
    bumpPackageMap: Map<string, PackageWithRangeSpec>,
    prerelease: boolean,
    onlyBumpPrerelease: boolean,
    changedVersions?: VersionBag,
) {
    let changed = false;
    let newRangeString: string;
    for (const { name, dev } of pkg.combinedDependencies) {
        const dep = bumpPackageMap.get(name);
        if (
            dep !== undefined &&
            // ignore dependencies that are a part of the same release group (monorepo)
            !MonoRepo.isSame(dep.pkg.monoRepo, pkg.monoRepo)
        ) {
            const dependencies = dev
                ? pkg.packageJson.devDependencies
                : pkg.packageJson.dependencies;
            const verString = dependencies[name];
            const depIsPrerelease = (semver.minVersion(verString)?.prerelease?.length ?? 0) > 0;

            const depNewRangeOrBumpType = dep.rangeOrBumpType;
            // eslint-disable-next-line unicorn/prefer-ternary
            if (isVersionBumpTypeExtended(depNewRangeOrBumpType)) {
                // bump the current range string
                newRangeString = bumpRange(verString, depNewRangeOrBumpType, prerelease);
            } else {
                newRangeString = depNewRangeOrBumpType;
            }

            // If we're only bumping prereleases, check if the dep is a pre-release. Otherwise bump all packages whose
            // range doesn't match the current value.
            if ((onlyBumpPrerelease && depIsPrerelease) || dependencies[name] !== newRangeString) {
                changed = true;
                dependencies[name] = newRangeString;
                changedVersions?.add(dep.pkg, newRangeString);
            }
        }
    }

    if (changed) {
        await pkg.savePackageJson();
    }

    return changed;
}
