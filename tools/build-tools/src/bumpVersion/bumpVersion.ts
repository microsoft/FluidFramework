/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */


import { strict as assert } from "assert";
import { Context, VersionChangeType } from "./context";
import { getRepoStateChange } from "./versionBag";
import { fatal, exec } from "./utils";
import { MonoRepo, MonoRepoKind } from "../common/monoRepo";
import { Package } from "../common/npmPackage";
import * as semver from "semver";


/**
 * Functions and utilities to update the package versions
 */


export async function bumpVersion(context: Context, bump: string[], version: VersionChangeType, packageShortNames: string, commit?: string) {
    console.log(`Bumping ${packageShortNames} to ${version}`);

    let clientNeedBump = false;
    let serverNeedBump = false;
    let packageNeedBump = new Set<Package>();
    for (const name of bump) {
        if (name === MonoRepoKind[MonoRepoKind.Client]) {
            clientNeedBump = true;
            const ret = await context.repo.clientMonoRepo.install();
            if (ret.error) {
                fatal("Install failed");
            }
        } else if (name === MonoRepoKind[MonoRepoKind.Server]) {
            serverNeedBump = true;
            assert(context.repo.serverMonoRepo, "Attempted to bump server version on a Fluid repo with no server directory");
            const ret = await context.repo.serverMonoRepo!.install();
            if (ret.error) {
                fatal("Install failed");
            }
        } else {
            const pkg = context.fullPackageMap.get(name);
            if (!pkg) {
                fatal(`Package ${name} not found. Unable to bump version`);
            }
            if (pkg.monoRepo) {
                fatal(`Monorepo package can't be bump individually`);
            }
            packageNeedBump.add(pkg);
            const ret = await pkg.install();
            if (ret.error) {
                fatal("Install failed");
            }
        }
    }

    const oldVersions = context.collectVersions();
    const newVersions = await bumpRepo(context, version, clientNeedBump, serverNeedBump, packageNeedBump);
    const bumpRepoState = getRepoStateChange(oldVersions, newVersions);
    console.log(bumpRepoState);

    if (commit !== undefined) {
        await context.gitRepo.commit(`[bump] package version for ${packageShortNames}\n${bumpRepoState}${commit}`, "create bumped version commit");
    }
}


/**
 * Bump version of packages in the repo
 *
 * @param versionBump the kind of version bump
 */
export async function bumpRepo(context: Context, versionBump: VersionChangeType, clientNeedBump: boolean, serverNeedBump: boolean, packageNeedBump: Set<Package>) {
    const bumpMonoRepo = async (monoRepo: MonoRepo) => {
        return exec(`npx lerna version ${versionBump} --no-push --no-git-tag-version -y && npm run build:genver`, monoRepo.repoPath, "bump mono repo");
    }

    if (clientNeedBump) {
        console.log("  Bumping client version");
        await bumpLegacyDependencies(context, versionBump);
        await bumpMonoRepo(context.repo.clientMonoRepo);
    }

    if (serverNeedBump) {
        console.log("  Bumping server version");
        assert(context.repo.serverMonoRepo, "Attempted server version bump on a Fluid repo with no server directory");
        await bumpMonoRepo(context.repo.serverMonoRepo!);
    }

    for (const pkg of packageNeedBump) {
        console.log(`  Bumping ${pkg.name}`);
        let cmd = `npm version ${versionBump}`;
        if (pkg.getScript("build:genver")) {
            cmd += " && npm run build:genver";
        }
        await exec(cmd, pkg.directory, `bump version on ${pkg.name}`);
    }

    // Package json has changed. Reload.
    return context.collectVersions(true);
}

async function bumpLegacyDependencies(context:Context, versionBump: VersionChangeType) {
    if (versionBump !== "patch") {
        // Assumes that we want N/N-1 testing
        const pkg = context.fullPackageMap.get("@fluid-internal/end-to-end-tests");
        if (!pkg) {
            fatal("Unable to find package @fluid-internal/end-to-end-tests");
        }
        for (const { name, version, dev } of pkg.combinedDependencies) {
            if (!version.startsWith("npm:")) {
                continue;
            }

            const spec = version.substring(4);
            const split = spec.split("@");
            if (split.length <= 1) {
                continue;
            }
            const range = split.pop();
            const packageName = split.join("@");
            const depPackage = context.fullPackageMap.get(packageName);
            if (depPackage) {
                const dep = dev ? pkg.packageJson.devDependencies : pkg.packageJson.dependencies;

                if (typeof versionBump === "string") {
                    dep[name] = `npm:${packageName}@^${semver.major(depPackage.version)}.${semver.minor(depPackage.version) - 1}.0`;
                } else {
                    dep[name] = `npm:${packageName}@^${versionBump.major}.${versionBump.minor - 2}.0}`;
                }

            }
        }
        pkg.savePackageJson();
    }
}
