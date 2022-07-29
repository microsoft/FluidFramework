/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { exec, MonoRepo, Package, VersionBag } from "@fluidframework/build-tools";
import {
    adjustVersion,
    incRange,
    isVersionBumpType,
    isVersionBumpTypeExtended,
    VersionChangeType,
    VersionScheme,
} from "@fluid-tools/version-tools";
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
                newRangeString = incRange(verString, depNewRangeOrBumpType, prerelease);
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

/**
 * Bumps a release group (or standalone package) by the bumpType.
 *
 * @param bumpType - The bump type.
 * @param releaseGroupOrPackage - A release group repo or package to bump.
 * @param scheme - The version scheme to use.
 */
export async function bumpReleaseGroup(
    bumpType: VersionChangeType,
    releaseGroupOrPackage: MonoRepo | Package,
    scheme: VersionScheme,
) {
    const translatedVersion = isVersionBumpType(bumpType)
        ? adjustVersion(releaseGroupOrPackage.version, bumpType, scheme)
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

    return exec(cmd, workingDir, `Error bumping ${releaseGroupOrPackage}`);
}

// /**
//  * @remarks
//  *
//  * Work in progress.
//  */
// async function setReleaseGroupVersion(
//     context: Context,
//     version: semver.SemVer,
//     releaseGroup: MonoRepoKind,
//     versionBag?: VersionBag,
// ) {
//     const toBump = context.repo.monoRepos.get(releaseGroup);
//     assert(toBump !== undefined, `No monorepo with name '${toBump}'`);
//     console.log(`  Current version of ${releaseGroup}: ${toBump.version}`);
//     console.log(`  Setting ${releaseGroup} version to: ${version}`);

//     const packages = new Set<string>(toBump.packages.map((p) => p.name));
//     // const packageBumpMap = new Map<string, { pkg: Package, rangeSpec: string }>();
//     const mismatchedVersions = new Set<string>();
//     const expectedVersion = version.version;
//     const expectedRangeSpec = `^${expectedVersion}`;
//     for (const pkg of toBump.packages) {
//         if (semver.neq(pkg.version, expectedVersion)) {
//             // console.log(`${pkg.name}: ${pkg.version} (should be ${expectedVersion})`);
//             mismatchedVersions.add(pkg.name);
//         }

//         // Check dependencies for mismatches as well because they may have an incorrect range even though the
//         // package.json version for the package is correct.
//         for (const { name: dep, version: depVersion } of pkg.combinedDependencies) {
//             if (packages.has(dep) && depVersion !== expectedRangeSpec) {
//                 // console.log(`${dep}: ${version} (should be ${expectedRangeSpec})`);
//                 mismatchedVersions.add(dep);
//             }
//             // packageBumpMap.set(pkg.name, { pkg, rangeSpec: `^${expectedVersion}` })
//         }

//         pkg.packageJson.version = expectedVersion;
//         // eslint-disable-next-line no-await-in-loop
//         await pkg.savePackageJson();
//     }

//     console.log(`  Found ${mismatchedVersions.size} mismatched packages.`);
//     for (const v of mismatchedVersions) {
//         console.log(`    ${v}`);
//     }

//     for (const pkg of toBump.packages) {
//         for (const { name, dev } of pkg.combinedDependencies) {
//             if (mismatchedVersions.has(name)) {
//                 if (dev) {
//                     pkg.packageJson.devDependencies[name] = expectedRangeSpec;
//                 } else {
//                     pkg.packageJson.dependencies[name] = expectedRangeSpec;
//                 }
//             }
//         }

//         // eslint-disable-next-line no-await-in-loop
//         await pkg.savePackageJson();
//     }

//     // for (const pkg of packageNeedBump) {
//     //     console.log(`  Bumping ${pkg.name}${vPatchLogString}`);
//     //     // Translate the versionBump into the appropriate change for virtual patch versioning
//     //     const translatedVersionBump = translateVirtualVersion(versionBump, versionBag.get(pkg.name), virtualPatch);
//     //     let cmd = `npm version ${translatedVersionBump}`;
//     //     if (pkg.getScript("build:genver")) {
//     //         cmd += " && npm run build:genver";
//     //     }
//     //     await exec(cmd, pkg.directory, `bump version on ${pkg.name}`);
//     // }

//     // Package json has changed. Reload.
//     return context.collectVersions(true);
// }

// /**
//  * Bumps several release groups or packages.
//  *
//  * @remarks
//  *
//  * Work in progress.
//  *
//  * @param context -
//  * @param bumpType -
//  * @param monoReposNeedBump -
//  * @param packageNeedBump -
//  * @param scheme -
//  * @param versionBag -
//  * @returns
//  */
// async function bumpMany(
//     context: Context,
//     bumpType: VersionBumpTypeExtended,
//     monoReposNeedBump: Set<ReleaseGroup>,
//     packageNeedBump: Set<Package>,
//     scheme: VersionScheme,
//     versionBag?: VersionBag,
// ) {
//     // const scheme: VersionScheme = virtualPatch ? "virtualPatch" : "semver";
//     // const vPatchLogString = virtualPatch ? " using virtual patches" : "";

//     for (const monoRepo of monoReposNeedBump) {
//         console.log(`  Bumping ${monoRepo} (${scheme} version scheme)...`);
//         // Translate the versionBump into the appropriate change for virtual patch versioning
//         const ver = context.getVersion(monoRepo);
//         assert(ver, "ver is missing");
//         const adjVer = adjustVersion(ver, bumpType, scheme);
//         const toBump = context.repo.releaseGroups.get(monoRepo);
//         assert(toBump !== undefined, `No release group with name '${toBump}'`);
//         if (toBump !== undefined) {
//             // eslint-disable-next-line no-await-in-loop
//             await bumpReleaseGroup(adjVer, toBump, scheme);
//         }
//     }

//     for (const pkg of packageNeedBump) {
//         console.log(`  Bumping ${pkg.name}${scheme}...`);
//         // Translate the versionBump into the appropriate change for virtual patch versioning
//         const translatedVersionBump = adjustVersion(context.getVersion(pkg.name), bumpType, scheme);
//         let cmd = `npm version ${translatedVersionBump}`;
//         if (pkg.getScript("build:genver") !== undefined) {
//             cmd += " && npm run build:genver";
//         }

//         // eslint-disable-next-line no-await-in-loop
//         await exec(cmd, pkg.directory, `bump version on ${pkg.name}`);
//     }

//     // Package json has changed. Reload.
//     return context.collectVersions(true);
// }
