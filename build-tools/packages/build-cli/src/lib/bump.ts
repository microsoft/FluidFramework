/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context, exec, MonoRepo, Package, VersionBag } from "@fluidframework/build-tools";
import {
    bumpVersionScheme,
    bumpRange,
    isVersionBumpType,
    isVersionBumpTypeExtended,
    VersionChangeType,
    VersionScheme,
    getVersionRange,
} from "@fluid-tools/version-tools";
import * as semver from "semver";

/**
 * A mapping of {@link Package} to a version range string or a bump type. This interface is used for convenience.
 *
 * @internal
 */
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
 * @param updateWithinSameReleaseGroup - If true, will update dependency ranges of deps within the same release group.
 * Generally this should be false, but in some cases you may need to set a precise dependency range string within the
 * same release group.
 * @param changedVersions - If provided, the changed packages will be put into this {@link VersionBag}.
 * @returns True if the packages dependencies were changed; false otherwise.
 *
 * @remarks
 *
 * By default, dependencies on packages within the same release group -- that is, intra-release-group dependencies --
 * will not be changed (`updateWithinSameReleaseGroup === false`). This is typically the behavior you want. However,
 * there are some cases where you need to forcefully change the dependency range of packages across the whole repo. For
 * example, when bumping packages using the Fluid internal version scheme, we need to adjust the dependency ranges that
 * lerna creates automatically, because the Fluid internal version scheme requires us to use \>= \< dependency ranges
 * instead of ^.
 *
 * @internal
 */
// eslint-disable-next-line max-params
export async function bumpPackageDependencies(
    pkg: Package,
    bumpPackageMap: Map<string, PackageWithRangeSpec>,
    prerelease: boolean,
    onlyBumpPrerelease: boolean,
    // eslint-disable-next-line default-param-last
    updateWithinSameReleaseGroup = false,
    changedVersions?: VersionBag,
) {
    let changed = false;
    let newRangeString: string;
    for (const { name, dev } of pkg.combinedDependencies) {
        const dep = bumpPackageMap.get(name);
        if (dep !== undefined) {
            const isSameReleaseGroup = MonoRepo.isSame(dep?.pkg.monoRepo, pkg.monoRepo);
            if (!isSameReleaseGroup || (updateWithinSameReleaseGroup && isSameReleaseGroup)) {
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

                // If we're only bumping prereleases, check if the dep is a pre-release. Otherwise bump all packages
                // whose range doesn't match the current value.
                if (
                    (onlyBumpPrerelease && depIsPrerelease) ||
                    dependencies[name] !== newRangeString
                ) {
                    changed = true;
                    dependencies[name] = newRangeString;
                    changedVersions?.add(dep.pkg, newRangeString);
                }
            }
        }
    }

    if (changed) {
        await pkg.savePackageJson();
    }

    return changed;
}

/**
 * Bumps a release group or standalone package by the bumpType.
 *
 * @param bumpType - The bump type.
 * @param releaseGroupOrPackage - A release group repo or package to bump.
 * @param scheme - The version scheme to use.
 *
 * @internal
 */
export async function bumpVersion(
    context: Context,
    bumpType: VersionChangeType,
    releaseGroupOrPackage: MonoRepo | Package,
    scheme: VersionScheme,
) {
    const translatedVersion = isVersionBumpType(bumpType)
        ? bumpVersionScheme(releaseGroupOrPackage.version, bumpType, scheme)
        : bumpType;
    let cmd: string;
    let workingDir: string;

    if (releaseGroupOrPackage instanceof MonoRepo) {
        workingDir = releaseGroupOrPackage.repoPath;
        cmd = `npx lerna version ${translatedVersion.version} --no-push --no-git-tag-version -y && npm run build:genver`;
    } else {
        workingDir = releaseGroupOrPackage.directory;
        cmd = `npm version ${translatedVersion.version}`;
        if (releaseGroupOrPackage.getScript("build:genver") !== undefined) {
            cmd += " && npm run build:genver";
        }
    }

    const results = await exec(cmd, workingDir, `Error bumping ${releaseGroupOrPackage}`);
    context.repo.reload();

    // the lerna version command sets the dependency range of managed packages to a caret (^) dependency range. However,
    // for the internal version scheme, the range needs to be a >= < range.
    if (scheme === "internal") {
        const range = getVersionRange(translatedVersion, "^");
        if (releaseGroupOrPackage instanceof MonoRepo) {
            const packagesToCheckAndUpdate = releaseGroupOrPackage.packages;
            const packageNewVersionMap = new Map<string, PackageWithRangeSpec>();
            for (const pkg of packagesToCheckAndUpdate) {
                packageNewVersionMap.set(pkg.name, { pkg, rangeOrBumpType: range });
            }

            for (const pkg of packagesToCheckAndUpdate) {
                // eslint-disable-next-line no-await-in-loop
                await bumpPackageDependencies(
                    pkg,
                    packageNewVersionMap,
                    /* prerelease */ false,
                    /* onlyBumpPrerelease */ false,
                    /* updateWithinSameReleaseGroup */ true,
                );
            }
        }
    }

    return results;
}
