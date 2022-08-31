/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import { Context, readJsonAsync, Logger, Package, MonoRepo } from "@fluidframework/build-tools";
import { isPrereleaseVersion } from "@fluid-tools/version-tools";
import { PackageName } from "@rushstack/node-core-library";
import { compareDesc } from "date-fns";
import ncu from "npm-check-updates";
// eslint-disable-next-line import/no-internal-modules
import { VersionSpec } from "npm-check-updates/build/src/types/VersionSpec";
// eslint-disable-next-line import/no-internal-modules
import type { Index } from "npm-check-updates/build/src/types/IndexType";
import * as semver from "semver";
import { isReleaseGroup, ReleaseGroup, ReleasePackage } from "../releaseGroups";

/**
 * Checks the npm registry for updates for a release group's dependencies.
 *
 * @param context - The {@link Context}.
 * @param releaseGroup - The release group to check.
 * @param depsToUpdate - An array of packages on which dependencies should be checked.
 * @param bumpType - The bump type.
 * @param prerelease - If true, include prerelease versions as eligible to update.
 * @param writeChanges - If true, changes will be written to the package.json files.
 * @param log - A {@link Logger}.
 * @returns An array of packages that had updated dependencies.
 *
 * @internal
 */
// eslint-disable-next-line max-params
export async function npmCheckUpdates(
    context: Context,
    releaseGroup: ReleaseGroup | ReleasePackage,
    depsToUpdate: ReleasePackage[] | RegExp[],
    bumpType: "patch" | "minor" | "current",
    // eslint-disable-next-line default-param-last
    prerelease = false,
    // eslint-disable-next-line default-param-last
    writeChanges = false,
    log?: Logger,
): Promise<{
    updatedPackages: Package[];
    updatedDependencies: Package[];
}> {
    const updatedPackages: Package[] = [];
    const deps = new Set<string>();
    // There can be a lot of duplicate log lines from npm-check-updates, so collect and dedupe before logging.
    const upgradeLogLines = new Set<string>();
    const searchGlobs: string[] = [];
    let repoPath: string;

    log?.info(`Checking npm for package updates...`);
    if (isReleaseGroup(releaseGroup)) {
        const monorepo = context.repo.releaseGroups.get(releaseGroup);
        if (monorepo === undefined) {
            throw new Error(`Can't find release group: ${releaseGroup}`);
        }

        searchGlobs.push(...monorepo.workspaceGlobs);
        repoPath = monorepo.repoPath;
    } else {
        const pkg = context.fullPackageMap.get(releaseGroup);
        if (pkg === undefined) {
            throw new Error(`Package not found in context: ${releaseGroup}`);
        }

        searchGlobs.push(pkg.directory);
        repoPath = pkg.directory;
    }

    for (const glob of searchGlobs) {
        log?.verbose(`Checking packages in ${glob}...`);

        // eslint-disable-next-line no-await-in-loop
        const result = (await ncu({
            filter: depsToUpdate,
            cwd: repoPath,
            packageFile: `${glob}/package.json`,
            target: bumpType === "current" ? "latest" : bumpType,
            pre: prerelease,
            upgrade: writeChanges,
            jsonUpgraded: true,
            silent: true,
        })) as Index<VersionSpec>;

        if (typeof result !== "object") {
            throw new TypeError(`Expected an object: ${typeof result}`);
        }

        for (const [pkgJsonPath, upgradedDeps] of Object.entries(result)) {
            const jsonPath = path.join(repoPath, pkgJsonPath);
            // eslint-disable-next-line no-await-in-loop
            const { name } = await readJsonAsync(jsonPath);
            const pkg = context.fullPackageMap.get(name);
            if (pkg === undefined) {
                log?.warning(`Package not found in context: ${name}`);
                continue;
            }

            for (const [dep, newRange] of Object.entries(upgradedDeps)) {
                upgradeLogLines.add(`    ${dep}: '${newRange}'`);
                deps.add(dep);
            }

            if (Object.keys(upgradedDeps).length > 0) {
                updatedPackages.push(pkg);
            }
        }
    }

    log?.info(`${upgradeLogLines.size} released dependencies found on npm:`);
    for (const line of upgradeLogLines.values()) {
        log?.info(line);
    }

    const updatedDependencies: Package[] = getPackagesFromReleasePackages(context, [...deps]);

    return { updatedPackages, updatedDependencies };
}

/**
 * An object containing release groups and package dependencies that are a prerelease version.
 *
 * @internal
 */
export interface PreReleaseDependencies {
    /** A map of release groups to a version string. */
    releaseGroups: Map<ReleaseGroup, string>;
    /** A map of release packages to a version string. Only includes independent packages. */
    packages: Map<ReleasePackage, string>;
    /** True if there are no pre-release dependencies. False otherwise. */
    isEmpty: boolean;
}

/**
 * Checks all the packages in a release group for any that are a pre-release version.
 *
 * @param context - The context.
 * @param releaseGroup - The release group.
 * @returns A {@link PreReleaseDependencies} object containing the pre-release dependency names and versions.
 *
 * @internal
 */
export async function getPreReleaseDependencies(
    context: Context,
    releaseGroup: ReleaseGroup | ReleasePackage,
    // depsToUpdate: ReleasePackage[],
): Promise<PreReleaseDependencies> {
    const prereleasePackages = new Map<ReleasePackage, string>();
    const prereleaseGroups = new Map<ReleaseGroup, string>();
    let packagesToCheck: Package[];
    let depsToUpdate: ReleasePackage[];

    if (isReleaseGroup(releaseGroup)) {
        const monorepo = context.repo.releaseGroups.get(releaseGroup);
        if (monorepo === undefined) {
            throw new Error(`Can't find release group in context: ${releaseGroup}`);
        }

        packagesToCheck = monorepo.packages;
        depsToUpdate = context.packagesNotInReleaseGroup(releaseGroup).map((p) => p.name);
    } else {
        const pkg = context.fullPackageMap.get(releaseGroup);
        if (pkg === undefined) {
            throw new Error(`Can't find package in context: ${releaseGroup}`);
        }

        packagesToCheck = [pkg];
        depsToUpdate = context.packagesNotInReleaseGroup(pkg).map((p) => p.name);
    }

    for (const pkg of packagesToCheck) {
        for (const { name: depName, version: depVersion } of pkg.combinedDependencies) {
            // If it's not a dep we're looking to update, skip to the next dep
            if (!depsToUpdate.includes(depName)) {
                continue;
            }

            // Convert the range into the minimum version
            const minVer = semver.minVersion(depVersion);
            if (minVer === null) {
                throw new Error(`semver.minVersion was null: ${depVersion} (${depName})`);
            }

            // If the min version has a pre-release section, then it needs to be released.
            if (isPrereleaseVersion(minVer) === true) {
                const depPkg = context.fullPackageMap.get(depName);
                if (depPkg === undefined) {
                    throw new Error(`Can't find package in context: ${depName}`);
                }

                const nameToUse =
                    depPkg.monoRepo === undefined ? depPkg.name : depPkg.monoRepo.kind;
                prereleasePackages.set(nameToUse, depVersion);

                if (depPkg.monoRepo === undefined) {
                    prereleasePackages.set(depPkg.name, depVersion);
                } else {
                    prereleaseGroups.set(depPkg.monoRepo.kind, depVersion);
                }
            }
        }
    }

    const isEmpty = prereleaseGroups.size === 0 && prereleasePackages.size === 0;
    return {
        releaseGroups: prereleaseGroups,
        packages: prereleasePackages,
        isEmpty,
    };
}

/** Convenience function to hydrate an array of {@link Package} objects from {@link ReleasePackage}s. */
function getPackagesFromReleasePackages(
    context: Context,
    relPackages: ReleasePackage[],
): Package[] {
    const packages: Package[] = [];

    for (const rp of relPackages) {
        const pkg = context.fullPackageMap.get(rp);
        if (pkg === undefined) {
            throw new Error(`Can't find package in context: ${rp}`);
        }

        packages.push(pkg);
    }

    return packages;
}

/**
 * Returns true if a release group or package in the repo has been released.
 *
 * @param context - The context.
 * @param releaseGroupOrPackage - The release group to check.
 * @returns True if the release group was released.
 *
 * @remarks
 *
 * This function exclusively uses the tags in the repo to determine whether a release has bee done or not.
 *
 * @internal
 */
export async function isReleased(
    context: Context,
    releaseGroupOrPackage: MonoRepo | Package | string,
    version: string,
    log?: Logger,
): Promise<boolean> {
    await context.gitRepo.fetchTags();

    const tagName = generateReleaseGitTagName(releaseGroupOrPackage, version);
    if (typeof releaseGroupOrPackage === "string" && isReleaseGroup(releaseGroupOrPackage)) {
        // eslint-disable-next-line no-param-reassign
        releaseGroupOrPackage = context.repo.releaseGroups.get(releaseGroupOrPackage)!;
    }

    log?.verbose(`Checking for tag '${tagName}'`);
    const rawTag = await context.gitRepo.getTags(tagName);
    return rawTag.trim() === tagName;
}

/**
 * Generates the correct git tag name for the release of a given release group and version.
 *
 * @param releaseGroupOrPackage - The release group or independent package to generate a tag name for.
 * @param version - The version to use for the generated tag.
 * @returns The generated tag name.
 *
 * @internal
 */
export function generateReleaseGitTagName(
    releaseGroupOrPackage: MonoRepo | Package | string,
    version?: string,
): string {
    let tagName = "";

    if (releaseGroupOrPackage instanceof MonoRepo) {
        const kindLowerCase = releaseGroupOrPackage.kind.toLowerCase();
        tagName = `${kindLowerCase}_v${version ?? releaseGroupOrPackage.version}`;
    } else if (releaseGroupOrPackage instanceof Package) {
        tagName = `${PackageName.getUnscopedName(releaseGroupOrPackage.name)}_v${
            version ?? releaseGroupOrPackage.version
        }`;
    } else {
        tagName = `${PackageName.getUnscopedName(releaseGroupOrPackage)}_v${version}`;
    }

    return tagName;
}

/**
 *  Returns an array of all the git tags associated with a release group.
 *
 * @param context - The {@link Context}.
 * @param releaseGroupOrPackage - The release group or independent package to get tags for.
 * @returns An array of all all the tags for the release group or package.
 *
 * @internal
 */
export async function getTagsForReleaseGroup(
    context: Context,
    releaseGroupOrPackage: ReleaseGroup | ReleasePackage,
): Promise<string[]> {
    let prefix = "";
    try {
        prefix = isReleaseGroup(releaseGroupOrPackage)
            ? releaseGroupOrPackage.toLowerCase()
            : PackageName.getUnscopedName(releaseGroupOrPackage);
    } catch {
        console.log(releaseGroupOrPackage);
    }

    const allTags = await context.gitRepo.getAllTags(`${prefix}*`);
    return allTags;
}

/**
 * Parses the version from a git tag.
 *
 * @param tag - The tag.
 * @returns - The version string, or undefined if one could not be found.
 *
 * @internal
 */
export function getVersionFromTag(tag: string): string | undefined {
    // TODO: Consider a stronger check here using a regex.
    const tagSplit = tag.split("_v");
    if (tagSplit.length !== 2) {
        return undefined;
    }

    const ver = semver.parse(tagSplit[1]);
    if (ver === null) {
        return undefined;
    }

    return ver.version;
}

/**
 * Represents a version and its release date, if applicable.
 *
 * @internal
 */
export interface VersionDetails {
    /** The version. */
    version: string;
    /** The date the version was released, if applicable. */
    date?: Date;
}

/**
 * Gets all the versions for a release group or independent package. This function only considers the tags in the repo
 * to determine releases and dates.
 *
 * @param context - The {@link Context}.
 * @param releaseGroupOrPackage - The release group or independent package to get versions for.
 * @param allowPrereleases - If true, allow pre-release versions to be returned. Otherwise all pre-release versions will
 * be filtered out of the returned array.
 * @returns An array of {@link VersionDetails} containing the version and date for each version.
 *
 * @internal
 */
export async function getAllVersions(
    context: Context,
    releaseGroupOrPackage: ReleaseGroup | ReleasePackage,
    allowPrereleases = false,
): Promise<VersionDetails[] | undefined> {
    const versions = new Map<string, Date>();
    const tags = await getTagsForReleaseGroup(context, releaseGroupOrPackage);

    for (const tag of tags) {
        const ver = getVersionFromTag(tag);
        if (ver !== undefined && ver !== "" && ver !== null) {
            // eslint-disable-next-line no-await-in-loop
            const date = await context.gitRepo.getCommitDate(tag);
            versions.set(ver, date);
        }
    }

    if (versions.size === 0) {
        return undefined;
    }

    const toReturn: VersionDetails[] = [];
    for (const [version, date] of versions) {
        toReturn.push({ version, date });
    }

    return toReturn;
}

/**
 * Sorts an array of {@link VersionDetails} by version or date. The array will be cloned then sorted in place.
 *
 * @param versions - The array of versions to sort.
 * @param sortKey - The sort key.
 * @returns A sorted array.
 *
 * @internal
 */
export async function sortVersions(
    versions: VersionDetails[],
    sortKey: "version" | "date",
): Promise<VersionDetails[]> {
    const sortedVersions: VersionDetails[] = [];

    // Clone the array
    for (const item of versions) {
        sortedVersions.push(item);
    }

    if (sortKey === "version") {
        sortedVersions.sort((a, b) => semver.rcompare(a.version, b.version));
    } else {
        sortedVersions.sort((a, b) =>
            a.date === undefined || b.date === undefined ? -1 : compareDesc(a.date, b.date),
        );
    }

    return sortedVersions;
}
