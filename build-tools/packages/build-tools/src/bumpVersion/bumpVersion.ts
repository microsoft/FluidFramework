/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import * as semver from "semver";

import {
    VersionChangeType,
    VersionChangeTypeExtended,
    VersionScheme,
    bumpVersionScheme,
    isVersionBumpTypeExtended,
} from "@fluid-tools/version-tools";

import { MonoRepo, MonoRepoKind, isMonoRepoKind } from "../common/monoRepo";
import { Package } from "../common/npmPackage";
import { Context } from "./context";
import { getPackageShortName } from "./releaseVersion";
import { exec, fatal } from "./utils";
import { VersionBag, getRepoStateChange } from "./versionBag";

export async function bumpVersionCommand(
    context: Context,
    bump: string,
    version: VersionChangeType,
    commit: boolean,
    virtualPatch: boolean,
) {
    const bumpBranch = `bump_${version}_${Date.now()}`;
    if (commit) {
        console.log(`Creating branch ${bumpBranch}`);
        await context.createBranch(bumpBranch);
    }

    await bumpVersion(
        context,
        [bump],
        version,
        getPackageShortName(bump),
        virtualPatch,
        commit ? "" : undefined,
    );

    if (commit) {
        console.log(
            "======================================================================================================",
        );
        console.log(
            `Please create PR for branch ${bumpBranch} targeting ${context.originalBranchName}`,
        );
    }
}

/**
 * Functions and utilities to update the package versions
 */
export async function bumpVersion(
    context: Context,
    packagesToBump: string[],
    version: VersionChangeType,
    packageShortNames: string,
    virtualPatch: boolean,
    commit?: string,
) {
    console.log(`Bumping ${packageShortNames} to ${version}`);

    const monoRepoNeedsBump = new Set<MonoRepoKind>();
    const packageNeedBump = new Set<Package>();
    for (const name of packagesToBump) {
        if (isMonoRepoKind(name)) {
            monoRepoNeedsBump.add(name);
            const repo = context.repo.monoRepos.get(name);
            assert(
                repo !== undefined,
                `Attempted to bump ${name} version on a Fluid repo with no ${name} release group defined`,
            );
            const ret = await repo.install();
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
    const newVersions = await bumpRepo(
        context,
        version,
        monoRepoNeedsBump,
        packageNeedBump,
        virtualPatch,
        oldVersions,
    );
    const bumpRepoState = getRepoStateChange(oldVersions, newVersions);
    console.log(bumpRepoState);

    if (commit !== undefined) {
        await context.gitRepo.commit(
            `[bump] package version for ${packageShortNames} (${version})\n${bumpRepoState}${commit}`,
            "create bumped version commit",
        );
    }
}

/**
 * Bump version of packages in the repo
 *
 * @param versionBump the kind of version bump
 */
export async function bumpRepo(
    context: Context,
    versionBump: VersionChangeTypeExtended,
    monoReposNeedBump: Set<MonoRepoKind>,
    packageNeedBump: Set<Package>,
    virtualPatch: boolean,
    versionBag?: VersionBag,
) {
    /**
     * Gets the version for a package. If a versionBag was provided, it will be searched for the package. Otherwise, the
     * value is assumed to be a monorepo, so the context is searched.
     *
     * @returns A version string.
     */
    const getVersion = (key: MonoRepoKind | string): string => {
        let ver = "";
        if (versionBag !== undefined && !versionBag.isEmpty()) {
            ver = versionBag.get(key);
        } else if (isMonoRepoKind(key)) {
            // console.log(`getting version from repo`)
            const repo = context.repo.monoRepos.get(key);
            if (repo === undefined) {
                fatal(`repo not found: ${key}`);
            }
            ver = repo.version;
        } else {
            fatal(`${key} is not a valid MonoRepoKind`);
        }
        return ver;
    };

    const bumpMonoRepo = async (
        repoVersionBump: VersionChangeType | semver.SemVer,
        monoRepo: MonoRepo,
    ) => {
        return exec(
            `npx lerna version ${repoVersionBump} --no-push --no-git-tag-version -y && npm run build:genver`,
            monoRepo.repoPath,
            "bump mono repo",
        );
    };

    const scheme: VersionScheme = virtualPatch ? "virtualPatch" : "semver";
    const vPatchLogString = virtualPatch ? " using virtual patches" : "";

    for (const monoRepo of monoReposNeedBump) {
        console.log(`  Bumping ${monoRepo}${vPatchLogString}...`);
        // Translate the versionBump into the appropriate change for virtual patch versioning
        const ver = getVersion(monoRepo);
        assert(ver, "ver is missing");
        assert(isVersionBumpTypeExtended(versionBump), `${versionBump} is not a valid bump type.`);
        const adjVer = bumpVersionScheme(ver, versionBump, scheme);
        const toBump = context.repo.monoRepos.get(monoRepo);
        assert(toBump !== undefined, `No monorepo with name '${toBump}'`);
        if (toBump !== undefined) {
            await bumpLegacyDependencies(context, adjVer);
            await bumpMonoRepo(adjVer, toBump);
        }
    }

    for (const pkg of packageNeedBump) {
        console.log(`  Bumping ${pkg.name}${vPatchLogString}...`);
        assert(isVersionBumpTypeExtended(versionBump), `${versionBump} is not a valid bump type.`);
        const translatedVersionBump = bumpVersionScheme(getVersion(pkg.name), versionBump, scheme);
        let cmd = `npm version ${translatedVersionBump}`;
        if (pkg.getScript("build:genver")) {
            cmd += " && npm run build:genver";
        }
        await exec(cmd, pkg.directory, `bump version on ${pkg.name}`);
    }

    // Package json has changed. Reload.
    return context.collectVersions(true);
}

/**
 * Note: this function does nothing if called with versionBump !== "patch".
 */
async function bumpLegacyDependencies(context: Context, versionBump: VersionChangeType) {
    if (versionBump !== "patch") {
        // Assumes that we want N/N-1 testing
        const pkg =
            context.fullPackageMap.get("@fluidframework/test-end-to-end-tests") ||
            context.fullPackageMap.get("@fluid-internal/end-to-end-tests");
        if (!pkg) {
            fatal("Unable to find package @fluid-internal/end-to-end-tests");
        }

        // The dependency names don't have an enforced pattern, but they do retain a stable ordering
        // Keep a count of how many times we've encountered each dependency to properly set N-1, N-2, etc
        const pkgFrequencies = new Map<string, number>();
        for (const { name, version, dev } of pkg.combinedDependencies) {
            if (!version.startsWith("npm:")) {
                continue;
            }

            const spec = version.substring(4);
            const split = spec.split("@");
            if (split.length <= 1) {
                continue;
            }
            const range = split.pop()!;
            const packageName = split.join("@");
            const depPackage = context.fullPackageMap.get(packageName);
            if (depPackage) {
                const frequency = (pkgFrequencies.get(packageName) ?? 0) + 1;
                pkgFrequencies.set(packageName, frequency);

                const dep = dev ? pkg.packageJson.devDependencies : pkg.packageJson.dependencies;

                // N-1 (the first time we see the package) is bumped to pre-release versions,
                // while N-2 etc is bumped to release
                const suffix = frequency === 1 ? "-0" : "";
                if (typeof versionBump === "string") {
                    dep[name] = `npm:${packageName}@^${semver.major(depPackage.version)}.${
                        semver.minor(depPackage.version) - frequency + 1
                    }.0${suffix}`;
                } else {
                    dep[name] = `npm:${packageName}@^${versionBump.major}.${
                        versionBump.minor - frequency
                    }.0${suffix}}`;
                }
            }
        }
        pkg.savePackageJson();
    }
}
