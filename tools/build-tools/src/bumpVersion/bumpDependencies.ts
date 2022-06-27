/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context } from "./context";
import { VersionBag } from "./versionBag";
import { fatal, prereleaseSatisfies } from "./utils";
import { MonoRepo, MonoRepoKind } from "../common/monoRepo";
import { Package } from "../common/npmPackage";
import { FluidRepo } from "../common/fluidRepo";

/**
 * Bump cross package/monorepo dependencies
 *
 * Go all the packages in the repo and update the dependencies to the packages specified version to the one currently in the repo
 *
 * @param repo the repo to operate one
 * @param bumpDepPackages update dependencies to these set of packages to current in repo version
 * @param updateLock whether to update the lock file (by npm i) or not
 * @param release make dependencies target release version instead of pre-release versions (e.g. ^0.16.0 vs ^0.16.0-0)
 */
export async function bumpDependencies(context: Context, commitMessage: string, bumpDepPackages: Map<string, string | undefined>, updateLock: boolean, commit: boolean = false, release: boolean = false) {
    const suffix = release ? "" : "-0";
    const bumpPackages = context.repo.packages.packages.map(pkg => {
        const matchName = pkg.monoRepo ? MonoRepoKind[pkg.monoRepo.kind] : pkg.name;
        const matched = bumpDepPackages.has(matchName);
        // Only add the suffix if it is not user specified
        const version = bumpDepPackages.get(matchName) ?? `${pkg.version}${suffix}`;
        return { matched, pkg, version };
    }).filter(rec => rec.matched);
    if (bumpPackages.length === 0) {
        fatal("Unable to find dependencies to bump");
    }

    const bumpPackageMap = new Map(bumpPackages.map(rec => [rec.pkg.name, { pkg: rec.pkg, rangeSpec: `^${rec.version}` }]));
    return bumpDependenciesCore(context, commitMessage, bumpPackageMap, updateLock, commit, release);
}

async function bumpDependenciesCore(
    context: Context,
    commitMessage: string,
    bumpPackageMap: Map<string, { pkg: Package, rangeSpec: string }>,
    updateLock: boolean,
    commit: boolean,
    release: boolean,
) {
    let changed = false;
    const updateLockPackage: Package[] = [];

    const changedVersion = new VersionBag();
    for (const pkg of context.repo.packages.packages) {
        if (await bumpPackageDependencies(pkg, bumpPackageMap, release, changedVersion)) {
            updateLockPackage.push(pkg);
            changed = true;
        }
    }

    if (changed) {
        if (updateLockPackage.length !== 0) {
            if (updateLock) {
                // Fix package lock
                if (!await FluidRepo.ensureInstalled(updateLockPackage, false)) {
                    fatal("Install Failed");
                }
            } else {
                console.log("      SKIPPED: updating lock file");
            }
        }

        const changedVersionString: string[] = [];
        for (const [name, version] of changedVersion) {
            changedVersionString.push(`${name.padStart(40)} -> ${version}`);
        }
        const changedVersionMessage = changedVersionString.join("\n");
        const bumpBranch = `dep_${Date.now()}`;
        if (commit) {
            console.log(`Creating branch ${bumpBranch}`);
            await context.createBranch(bumpBranch);
            await context.gitRepo.commit(`${commitMessage}\n\n${changedVersionMessage}`, "bump dependencies");
        }
        console.log(`      ${commitMessage}`);
        console.log(changedVersionMessage);

        if (commit) {
            console.log("======================================================================================================");
            console.log(`Please create PR for branch ${bumpBranch} targeting ${context.originalBranchName}`);
        }

        return changedVersionMessage;
    } else {
        console.log("      No dependencies need to be updated");
    }
}

export function getReleasedPrereleaseDependencies(context: Context) {
    const bumpPackageMap = new Map<string, { pkg: Package, rangeSpec: string }>();
    for (const pkg of context.repo.packages.packages) {
        for (const dep of pkg.combinedDependencies) {
            // detect if the dependency include prerelease.  This doesn't work if it is range
            if (dep.version.includes("-")) {
                const depPackage = context.fullPackageMap.get(dep.name);
                // The prerelease dependence doesn't match the live version, assume that it is released already
                if (depPackage && !prereleaseSatisfies(depPackage.version, dep.version)) {
                    bumpPackageMap.set(dep.name, { pkg: depPackage, rangeSpec: dep.version.substring(0, dep.version.lastIndexOf("-")) });
                }
            }
        }
    }
    return bumpPackageMap;
}

export async function cleanPrereleaseDependencies(context: Context, updateLock: boolean, commit: boolean) {
    const releasedPrereleaseDependencies = getReleasedPrereleaseDependencies(context);
    if (releasedPrereleaseDependencies.size === 0) {
        console.log("No released prerelease dependencies found.");
        return;
    }
    console.log(`Updating released prerelease dependencies`
        + `\n${Array.from(releasedPrereleaseDependencies.keys()).join("\n  ")}`);

    await bumpDependenciesCore(context,
        "Remove prelease dependencies on release packages",
        releasedPrereleaseDependencies, updateLock, commit, false);
}

/**
 * Bump the dependencies of a package based on the what's in the packageMap, and save the package.json
 *
 * @param pkg the package to bump dependency versions
 * @param bumpPackageMap the map of package that needs to bump
 * @param release if we are releasing, only patch the pre-release dependencies
 * @param changedVersion the version bag to collect version that is changed
 */
async function bumpPackageDependencies(
    pkg: Package,
    bumpPackageMap: Map<string, { pkg: Package, rangeSpec: string }>,
    release: boolean,
    changedVersion?: VersionBag
) {
    let changed = false;
    for (const { name, dev } of pkg.combinedDependencies) {
        const dep = bumpPackageMap.get(name);
        if (dep && !MonoRepo.isSame(dep.pkg.monoRepo, pkg.monoRepo)) {
            const depVersion = dep.rangeSpec;
            const dependencies = dev ? pkg.packageJson.devDependencies : pkg.packageJson.dependencies;
            if (release ? dependencies[name].startsWith(`${depVersion}-`) : dependencies[name] !== depVersion) {
                if (changedVersion) {
                    changedVersion.add(dep.pkg, depVersion);
                }
                changed = true;
                dependencies[name] = depVersion;
            }
        }
    }

    if (changed) {
        await pkg.savePackageJson();
    }
    return changed;
}

