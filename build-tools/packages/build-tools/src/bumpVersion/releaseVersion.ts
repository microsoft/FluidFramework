/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context } from "./context";
import { bumpDependencies } from "./bumpDependencies";
import { bumpVersion } from "./bumpVersion";
import { runPolicyCheckWithFix } from "./policyCheck";
import { fatal } from "./utils";
import { isMonoRepoKind, MonoRepo, MonoRepoKind } from "../common/monoRepo";
import { Package } from "../common/npmPackage";
import { VersionBumpType } from "./versionSchemes";

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
export async function releaseVersion(
    context: Context,
    releaseName: MonoRepoKind | string,
    updateLock: boolean,
    virtualPatch: boolean,
    releaseVersion?: VersionBumpType,
    skipPolicyCheck = false,
    skipUpToDateCheck = false,
    ) {

    // run policy check before releasing a version.
    // right now this only does assert short codes
    // but could also apply other fixups in the future
    await runPolicyCheckWithFix(context);

    if (releaseVersion === undefined) {
        if (!context.originalBranchName.startsWith("release/")) {
            fatal(`Patch release should only be done on 'release/*' branches, but current branch is '${context.originalBranchName}'`);
        }
    } else if (releaseVersion !== "patch") {
        fatal(`Only patch release is allowed. ${releaseVersion} specified`);
    }

    const remote = await context.gitRepo.getRemote(context.originRemotePartialUrl);
    if (!remote) {
        fatal(`Unable to find remote for '${context.originRemotePartialUrl}'`)
    }

    if (!await context.gitRepo.isBranchUpToDate(context.originalBranchName, remote)) {
        fatal(`Local '${context.originalBranchName}' branch not up to date with remote. Please pull from '${remote}'.`);
    }

    const depVersions = await context.collectBumpInfo(releaseName);

    let releaseGroup: string | undefined;
    const packages: Package[] = [];
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
                if (isMonoRepoKind(name)) {
                    monoRepo = context.repo.monoRepos.get(name)
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
        return releaseMonoRepo(context, monoRepo, updateLock, virtualPatch);
    }
    return releasePackages(context, packages, updateLock, virtualPatch);
}

/**
 * Release a set of packages
 */
async function releasePackages(context: Context, packages: Package[], updateLock: boolean, virtualPatch: boolean) {
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
    return postRelease(context, packageTags.join(" "), pkgBumpString, packageNeedBump, updateLock, virtualPatch)
}

async function releaseMonoRepo(context: Context, monoRepo: MonoRepo, updateLock: boolean, virtualPatch: boolean) {
    const kind = monoRepo.kind;
    const kindLowerCase = monoRepo.kind.toLowerCase();
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
    return postRelease(context, tagName, kindLowerCase, bumpDep, updateLock, virtualPatch);
}

async function postRelease(context: Context, tagNames: string, packageNames: string, bumpDep: Map<string, string | undefined>, updateLock: boolean, virtualPatch: boolean) {
    console.log(`Tag ${tagNames} exists.`);
    console.log(`Bump version and update dependency for ${packageNames}`);
    // TODO: Ensure all published

    // Create branch
    const bumpBranch = `patch_bump_${Date.now()}`;
    await context.createBranch(bumpBranch);

    // Fix the pre-release dependency and update package lock
    const fixPrereleaseCommitMessage = `Also remove pre-release dependencies for ${packageNames}`;
    const message = await bumpDependencies(context, bumpDep, updateLock, false, fixPrereleaseCommitMessage, true);
    await bumpVersion(context, [...bumpDep.keys()], "patch", packageNames, virtualPatch, message ?
        `\n\n${fixPrereleaseCommitMessage}\n${message}` : "");

    console.log("======================================================================================================");
    console.log(`Please create PR for branch ${bumpBranch} targeting ${context.originalBranchName}`);
    console.log(`After PR is merged run --release list the next release`);
}
