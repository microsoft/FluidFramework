/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context, VersionBumpType } from "./context";
import { bumpDependencies } from "./bumpDependencies";
import { bumpVersion } from "./bumpVersion";
import { fatal } from "./utils";
import { MonoRepo, MonoRepoKind } from "../common/monoRepo";
import { Package } from "../common/npmPackage";

export function getPackageShortName(pkgName: string) {
    let name = pkgName.split("/").pop()!;
    if (name.startsWith("fluid-")) {
        name = name.substring("fluid-".length);
    }
    return name;
}

/**
 * Bump package version of the client monorepo
 * If it has dependencies to the current version of the other monorepo packages, bump package version of those too
 *
 * If --commit or --release is specified, the bumpped version changes will be committed and a release branch will be created
 */
export async function releaseVersion(context: Context, releaseName: string, updateLock: boolean, releaseVersion?: VersionBumpType) {
    const versionBump = await getVersionBumpKind(context, releaseVersion);
    if (versionBump !== "patch") {
        fatal(`Can't do ${versionBump} release on '${releaseName.toLowerCase()}' packages, only patch release is allowed`);
    }

    const depVersions = await context.collectBumpInfo(releaseName);

    let releaseGroup: string | undefined;
    let packages: Package[] = [];
    let monoRepo: MonoRepo | undefined;
    // Assumes that the packages are in dependency order already.
    for (const [name] of depVersions.repoVersions) {
        if (depVersions.needRelease(name)) {
            if (releaseGroup) {
                const pkg = context.fullPackageMap.get(name);
                if (pkg && pkg.name === releaseGroup) {
                    packages.push(pkg);
                }
            } else {
                if (name === MonoRepoKind[MonoRepoKind.Client]) {
                    monoRepo = context.repo.clientMonoRepo;
                    break;
                }
                if (name === MonoRepoKind[MonoRepoKind.Server]) {
                    monoRepo = context.repo.serverMonoRepo;
                    break;
                }
                const pkg = context.fullPackageMap.get(name);
                if (!pkg) {
                    fatal(`Unable find package ${name}`);
                }
                releaseGroup = pkg.group;
                packages.push(pkg);
            }
        }
    }

    if (!monoRepo && packages.length === 0) {
        fatal("Nothing to release");
    }

    if (monoRepo) {
        return releaseMonoRepo(context, monoRepo, updateLock);
    }
    return releasePackages(context, packages, updateLock);
}

/**
 * Determine either we want to bump minor on main or patch version on release/* based on branch name
 */
async function getVersionBumpKind(context: Context, releaseVersion?: VersionBumpType): Promise<VersionBumpType> {
    if (releaseVersion !== undefined) {
        return releaseVersion;
    }

    // Determine the kind of bump
    const branchName = context.originalBranchName;
    if (branchName !== "main" && !branchName!.startsWith("release/")) {
        fatal(`Unrecognized branch '${branchName}'`);
    }
    return branchName === "main" ? "minor" : "patch";
}

/**
 * Release a set of packages
 */
async function releasePackages(context: Context, packages: Package[], updateLock: boolean) {
    await context.gitRepo.fetchTags();
    const packageShortName: string[] = [];
    const packageTags: string[] = [];
    const packageNeedBump = new Map<string, string | undefined>();
    const packageToRelease: Package[] = [];

    for (const pkg of packages) {
        const name = getPackageShortName(pkg.name);
        const tagName = `${name}_v${pkg.version}`;
        packageShortName.push(name);
        packageTags.push(tagName);
        if ((await context.gitRepo.getTags(tagName)).trim() !== tagName) {
            packageToRelease.push(pkg);
        } else {
            packageNeedBump.set(pkg.name, undefined);
        }
    }

    if (packageToRelease.length !== 0) {
        console.log("======================================================================================================");
        console.log(`Please manually queue a release build for the following packages in ADO for branch ${context.originalBranchName}`);
        for (const pkg of packageToRelease) {
            console.log(`  ${pkg.name}`);
        }
        console.log(`After the build is done successfully run --release again to bump version and update dependency`);
        return;
    }

    const pkgBumpString = packageShortName.join(" ");
    return postRelease(context, packageTags.join(" "), pkgBumpString, packageNeedBump, updateLock)
}

async function releaseMonoRepo(context: Context, monoRepo: MonoRepo, updateLock: boolean) {
    const kind = MonoRepoKind[monoRepo.kind];
    const kindLowerCase = MonoRepoKind[monoRepo.kind].toLowerCase();
    const tagName = `${kindLowerCase}_v${monoRepo.version}`;
    await context.gitRepo.fetchTags();
    if ((await context.gitRepo.getTags(tagName)).trim() !== tagName) {
        console.log("======================================================================================================");
        console.log(`Please manually queue a release build for the following packages in ADO for branch ${context.originalBranchName}`);
        console.log(`  ${kindLowerCase}`);
        console.log(`After the build is done successfully run --release again to bump version and update dependency`);
        return;
    }
    const bumpDep = new Map<string, string | undefined>();
    bumpDep.set(kind, undefined);
    return postRelease(context, tagName, kindLowerCase, bumpDep, updateLock);
}

async function postRelease(context: Context, tagNames: string, packageNames: string, bumpDep: Map<string, string | undefined>, updateLock: boolean) {
    console.log(`Tag ${tagNames} exists.`);
    console.log(`Bump version and update dependency for ${packageNames}`);
    // TODO: Ensure all published

    // Create branch
    const bumpBranch = `patch_bump_${Date.now()}`;
    await context.createBranch(bumpBranch);

    // Fix the pre-release dependency and update package lock
    const fixPrereleaseCommitMessage = `Also remove pre-release dependencies for ${packageNames}`;
    const message = await bumpDependencies(context, fixPrereleaseCommitMessage, bumpDep, updateLock, false, true);
    await bumpVersion(context, [...bumpDep.keys()], "patch", packageNames, message ?
        `\n\n${fixPrereleaseCommitMessage}\n${message}` : "");

    console.log("======================================================================================================");
    console.log(`Please create PR for branch ${bumpBranch} targeting ${context.originalBranchName}`);
    console.log(`After PR is merged run --release list the next release`);
}
