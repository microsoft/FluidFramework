/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Context, isVersionBumpType, VersionChangeType, VersionChangeTypeExtended } from "./context";
import { getRepoStateChange, VersionBag } from "./versionBag";
import { fatal, exec, adjustVersion } from "./utils";
import { isMonoRepoKind, MonoRepo, MonoRepoKind } from "../common/monoRepo";
import { Package } from "../common/npmPackage";
import { getPackageShortName } from "./releaseVersion";
import * as semver from "semver";

export async function bumpVersionCommand(context: Context, bump: string, version: VersionChangeType, commit: boolean, virtualPatch: boolean) {
    const bumpBranch = `bump_${version}_${Date.now()}`;
    if (commit) {
        console.log(`Creating branch ${bumpBranch}`);
        await context.createBranch(bumpBranch);
    }

    await bumpVersion(context, [bump], version, getPackageShortName(bump), virtualPatch, commit ? "" : undefined);

    if (commit) {
        console.log("======================================================================================================");
        console.log(`Please create PR for branch ${bumpBranch} targeting ${context.originalBranchName}`);
    }
}

/**
 * Functions and utilities to update the package versions
 */
export async function bumpVersion(context: Context, bump: string[], version: VersionChangeType, packageShortNames: string, virtualPatch: boolean, commit?: string) {
    console.log(`Bumping ${packageShortNames} to ${version}`);

    const monoRepoNeedsBump = new Set<MonoRepoKind>();
    const packageNeedBump = new Set<Package>();
    for (const name of bump) {
        if (isMonoRepoKind(name)) {
            monoRepoNeedsBump.add(name);
            const repo = context.repo.monoRepos.get(name);
            assert(repo !== undefined,
                `Attempted to bump ${name} version on a Fluid repo with no ${name} release group defined`
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
    const newVersions = await bumpRepo(context, version, monoRepoNeedsBump, packageNeedBump, virtualPatch, oldVersions);
    const bumpRepoState = getRepoStateChange(oldVersions, newVersions);
    console.log(bumpRepoState);

    if (commit !== undefined) {
        await context.gitRepo.commit(`[bump] package version for ${packageShortNames} (${version})\n${bumpRepoState}${commit}`, "create bumped version commit");
    }
}


/**
 * Translate a VersionChangeType for the virtual patch scenario where we overload a beta version number
 * to include all of major, minor, and patch.  Actual semver type is not translated
 * "major" maps to "minor" with "patch" = 1000 (<N + 1>.0.0 -> 0.<N + 1>.1000)
 * "minor" maps to "patch" * 1000 (x.<N + 1>.0 -> 0.x.<N + 1>000)
 * "patch" is unchanged (but remember the final patch number holds "minor" * 1000 + the incrementing "patch")
 */
function translateVirtualVersion(
    versionBump: VersionChangeType,
    versionString: string,
    virtualPatch: boolean,
): VersionChangeType {
    if (!virtualPatch) {
        return versionBump;
    }

    // Virtual patch can only be used for a major/minor/patch bump and not a specific version
    if (!isVersionBumpType(versionBump)) {
        fatal("Can only use virtual patches when doing major/minor/patch bumps");
    }

    const virtualVersion = semver.parse(versionString);
    if (!virtualVersion) {
        fatal("unable to deconstruct package version for virtual patch");
    }
    if (virtualVersion.major !== 0) {
        fatal("Can only use virtual patches with major version 0");
    }

    switch (versionBump) {
        case "major": {
            virtualVersion.minor += 1;
            // the "minor" component starts at 1000 to work around issues padding to
            // 4 digits using 0s with semvers
            virtualVersion.patch = 1000;
            break;
        }
        case "minor": {
            virtualVersion.patch += 1000;
            break;
        }
        case "patch": {
            virtualVersion.patch += 1;
            break;
        }
    }

    virtualVersion.format(); // semver must be reformated after edits
    return virtualVersion;
}

export async function setReleaseGroupVersion(
    context: Context,
    version: semver.SemVer,
    releaseGroup: MonoRepoKind,
    versionBag?: VersionBag,
) {
    console.log(`  Setting ${releaseGroup} version to: ${version.version}`);
    // Translate the versionBump into the appropriate change for virtual patch versioning
    const toBump = context.repo.monoRepos.get(releaseGroup);
    assert(toBump !== undefined, `No monorepo with name '${toBump}'`);

    const packages = new Set<string>(toBump.packages.map(p => p.name));
    // const packageBumpMap = new Map<string, { pkg: Package, rangeSpec: string }>();
    const mismatchedVersions = new Set<string>();
    const expectedVersion = toBump.version;
    const expectedRangeSpec = `^${expectedVersion}`;
    for (const pkg of toBump.packages) {
        if (semver.neq(pkg.version, expectedVersion)) {
            // console.log(`${pkg.name}: ${pkg.version} (should be ${expectedVersion})`);
            mismatchedVersions.add(pkg.name);
        }

        // Check dependencies for mismatches as well because they may have an incorrect range even though the
        // package.json version for the package is correct.
        for (const { name: dep, version } of pkg.combinedDependencies) {
            if (packages.has(dep) && version !== expectedRangeSpec) {
                // console.log(`${dep}: ${version} (should be ${expectedRangeSpec})`);
                mismatchedVersions.add(dep)
            }
            // packageBumpMap.set(pkg.name, { pkg, rangeSpec: `^${expectedVersion}` })
        }
        pkg.packageJson.version = expectedVersion;
        await pkg.savePackageJson();
    }

    console.log(`  Found ${mismatchedVersions.size} mismatched packages.`);
    for (const v of mismatchedVersions) {
        console.log(`    ${v}`);
    }

    for (const pkg of toBump.packages) {
        for (const { name, dev } of pkg.combinedDependencies) {
            if (mismatchedVersions.has(name)) {
                if (dev) {
                    pkg.packageJson.devDependencies[name] = expectedRangeSpec;
                } else {
                    pkg.packageJson.dependencies[name] = expectedRangeSpec;
                }
            }
        }
        await pkg.savePackageJson();
    }

    // for (const pkg of packageNeedBump) {
    //     console.log(`  Bumping ${pkg.name}${vPatchLogString}`);
    //     // Translate the versionBump into the appropriate change for virtual patch versioning
    //     const translatedVersionBump = translateVirtualVersion(versionBump, versionBag.get(pkg.name), virtualPatch);
    //     let cmd = `npm version ${translatedVersionBump}`;
    //     if (pkg.getScript("build:genver")) {
    //         cmd += " && npm run build:genver";
    //     }
    //     await exec(cmd, pkg.directory, `bump version on ${pkg.name}`);
    // }

    // Package json has changed. Reload.
    return context.collectVersions(true);
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
    versionBag?: VersionBag
) {
    const getVersion = (key: MonoRepoKind | string): string => {
        // const verBag = versionBag !== undefined && Object.keys(versionBag).length > 0;
        let ver = "";
        if (versionBag !== undefined && !versionBag.isEmpty()) {
            // console.warn(`found a versionBag of length ${Object.keys(versionBag).length}...`);
            for (const k of Object.keys(versionBag)) {
                console.log(k);
            }
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
        console.log(`key: ${key}, ${ver}`);
        return ver;
    }

    const bumpMonoRepo = async (repoVersionBump: VersionChangeType | semver.SemVer, monoRepo: MonoRepo) => {
        return exec(`npx lerna version ${repoVersionBump} --no-push --no-git-tag-version -y && npm run build:genver`, monoRepo.repoPath, "bump mono repo");
    }

    const vPatchLogString = virtualPatch ? " using virtual patches" : "";

    for (const monoRepo of monoReposNeedBump) {
        console.log(`  Bumping ${monoRepo} version${vPatchLogString}`);
        // Translate the versionBump into the appropriate change for virtual patch versioning
        const ver = getVersion(monoRepo);
        assert(ver, "ver is missing");
        const adjVer = await adjustVersion(ver, versionBump);
        const translatedVersionBump = adjVer!;
        // translateVirtualVersion(adjVer!, versionBag.get(monoRepo), virtualPatch);
        const toBump = context.repo.monoRepos.get(monoRepo);
        assert(toBump !== undefined, `No monorepo with name '${toBump}'`);
        if (toBump !== undefined) {
            await bumpLegacyDependencies(context, translatedVersionBump);
            await bumpMonoRepo(translatedVersionBump, toBump);
        }
    }

    for (const pkg of packageNeedBump) {
        console.log(`  Bumping ${pkg.name}${vPatchLogString}`);
        // Translate the versionBump into the appropriate change for virtual patch versioning
        const translatedVersionBump = await adjustVersion(getVersion(pkg.name), versionBump);
        // translateVirtualVersion(versionBump as VersionChangeType, versionBag.get(pkg.name), virtualPatch);
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
        const pkg = context.fullPackageMap.get("@fluidframework/test-end-to-end-tests")
            || context.fullPackageMap.get("@fluid-internal/end-to-end-tests");
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
                    dep[name] = `npm:${packageName}@^${semver.major(depPackage.version)}.${semver.minor(depPackage.version) - frequency + 1}.0${suffix}`;
                } else {
                    dep[name] = `npm:${packageName}@^${versionBump.major}.${versionBump.minor - frequency}.0${suffix}}`;
                }

            }
        }
        pkg.savePackageJson();
    }
}
