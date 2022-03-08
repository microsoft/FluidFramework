/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context, VersionBumpType } from "./context";
import { getReleasedPrereleaseDependencies } from "./bumpDependencies";
import { bumpRepo } from "./bumpVersion";
import { ReferenceVersionBag, getRepoStateChange } from "./versionBag";
import { fatal, runPolicyCheckWithFix, } from "./utils";
import { MonoRepoKind } from "../common/monoRepo";
import { Package } from "../common/npmPackage";
import * as semver from "semver";

/**
 * Create release branch based on the repo state, bump minor version immediately
 * and push it to `main` and the new release branch to remote
 */
export async function createReleaseBranch(context: Context, virtualPatch: boolean) {

    // run policy check before creating release branch.
    // right now this only does assert short codes
    // but could also apply other fixups in the future
    await runPolicyCheckWithFix(context.gitRepo);

    const remote = await context.gitRepo.getRemote(context.originRemotePartialUrl);
    if (!remote) {
        fatal(`Unable to find remote for '${context.originRemotePartialUrl}'`)
    }

    if (context.originalBranchName !== "main") {
        console.warn("WARNING: Bumping minor version outside of main branch is not normal!  Make sure you know what you are doing.")
    } else if (!await context.gitRepo.isBranchUpToDate("main", remote)) {
        fatal(`Local 'main' branch not up to date with remote. Please pull from '${remote}'.`);
    }

    const releasedPrereleaseDependencies = getReleasedPrereleaseDependencies(context);
    if (releasedPrereleaseDependencies.size !== 0) {
        fatal(`Prelease dependencies for released package found. `
            + `Run 'bump-version --update' and submit the PR to update the dependencies first.`
            + `\n  ${Array.from(releasedPrereleaseDependencies.keys()).join("\n  ")}`);
    }

    // Create release branch based on client version
    const releaseName = MonoRepoKind[MonoRepoKind.Client];

    const depVersions = await context.collectBumpInfo(releaseName);
    const releaseVersion = depVersions.repoVersions.get(releaseName);
    if (!releaseVersion) {
        fatal(`Missing ${ releaseName } packages`);
    }

    // creating the release branch and bump the version
    const releaseBranchVersion = `${ semver.major(releaseVersion) }.${ semver.minor(releaseVersion) }`;
    const releaseBranch = `release/${ releaseBranchVersion }`;
    const commit = await context.gitRepo.getShaForBranch(releaseBranch);
    if (commit) {
        fatal(`${ releaseBranch } already exists`);
    }

    const bumpBranch = `minor_bump_${ releaseBranchVersion }_${ Date.now() }`;
    console.log(`Creating branch ${ bumpBranch }`);

    await context.createBranch(bumpBranch);

    // Make sure everything is installed (so that we can do build:genver)
    if (!await context.repo.install()) {
        fatal("Install failed");
    }

    // Bump the version
    console.log(`Bumping minor version for development`)
    console.log(await bumpCurrentBranch(context, "minor", releaseName, depVersions, virtualPatch));

    console.log("======================================================================================================");
    console.log(`Please create PR for branch ${ bumpBranch } targeting ${ context.originalBranchName } `);
    console.log(`After PR is merged, create branch ${ releaseBranch } one commit before the merged PR and push to the repo.`);
    console.log(`Then--release can be use to start the release.`);
}

/**
 * Create a commit with the version bump and return the repo transition state
 *
 * @param versionBump the kind of version Bump
 * @param serverNeedBump whether server version needs to be bump
 * @param packageNeedBump the set of packages that needs to be bump
 * @param oldVersions old versions
 */
async function bumpCurrentBranch(context: Context, versionBump: VersionBumpType, releaseName: string, depVersions: ReferenceVersionBag, virtualPatch: boolean) {
    let clientNeedBump = false;
    let serverNeedBump = false;
    const packageNeedBump = new Set<Package>();
    for (const [name] of depVersions) {
        if (depVersions.needBump(name)) {
            if (name === MonoRepoKind[MonoRepoKind.Client]) {
                clientNeedBump = true;
            } else if (name === MonoRepoKind[MonoRepoKind.Server]) {
                serverNeedBump = true;
            } else {
                const pkg = context.fullPackageMap.get(name);
                // the generator packages are not part of the full package map
                if (pkg) {
                    packageNeedBump.add(pkg);
                }
            }
        }
    }
    const newVersions = await bumpRepo(context, versionBump, clientNeedBump, serverNeedBump, packageNeedBump, virtualPatch, depVersions);
    const repoState = getRepoStateChange(depVersions.repoVersions, newVersions);

    const releaseNewVersion = newVersions.get(releaseName);
    const currentBranchName = await context.gitRepo.getCurrentBranchName();
    console.log(`  Committing ${ releaseName } version bump to ${ releaseNewVersion } into ${ currentBranchName } `);
    await context.gitRepo.commit(`[bump] package version to ${ releaseNewVersion } for development after ${ releaseName.toLowerCase() } release\n${ repoState } `, "create bumped version commit");
    return `Repo Versions in branch ${ currentBranchName }: ${ repoState } `;
}
