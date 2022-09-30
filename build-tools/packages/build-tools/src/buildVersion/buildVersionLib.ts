/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This script is used by the build server to compute the version number of the packages.
 * The release version number is based on what's in the lerna.json/package.json.
 * The CI will supply the build number and branch to determine the prerelease suffix if it is not a tagged build.
 *
 * Input:
 *      ./lerna.json or ./package.json - base version number to use
 *      env:VERSION_BUILDNUMBER        - monotonically increasing build number from the CI
 *      env:VERSION_RELEASE            - whether this is a release build or not
 *      env:VERSION_PATCH              - Put the build number in the patch
 * Output:
 *      The computed version output to the console.
 */

import child_process from "child_process";
import fs from "fs";
import { changePreReleaseIdentifier, detectVersionScheme, getLatestReleaseFromList, isInternalVersionScheme } from "@fluid-tools/version-tools";
import * as semver from "semver";
import { Logger } from "../common/logging";

/**
 * Gets a version from lerna.json if it exists, package.json otherwise. Exits the process if neither file is found.
 */
export function getFileVersion() {
    if (fs.existsSync("./lerna.json")) {
        return JSON.parse(fs.readFileSync("./lerna.json", { encoding: "utf8" })).version;
    }
    if (fs.existsSync("./package.json")) {
        return JSON.parse(fs.readFileSync("./package.json", { encoding: "utf8" })).version;
    }
    console.error(`ERROR: lerna.json or package.json not found`);
    process.exit(5);
}

function parseFileVersion(fileVersion: string, buildId?: number) {
    const split = fileVersion.split("-");
    let releaseVersion = split[0];
    split.shift();
    const prereleaseVersion = split.join("-");

    /**
     * Use the build id for patch number if given
     */
    if (buildId) {
        // split the prerelease out
        const r = releaseVersion.split('.');
        if (r.length !== 3) {
            console.error(`ERROR: Invalid format for release version ${releaseVersion}`);
            process.exit(9);
        }
        r[2] = (parseInt(r[2]) + buildId).toString();
        releaseVersion = r.join('.');
    }

    return { releaseVersion, prereleaseVersion };
}

/**
 * Compute the build suffix
 */
function getBuildSuffix(arg_release: boolean, build_num: string) {
    return arg_release ? "" : build_num;
}

/* A simpler CI version that append the build number at the end in the prerelease */
function generateSimpleVersion(release_version: string, prerelease_version: string, build_suffix: string) {
    // Generate the full version string
    if (prerelease_version) {
        if (build_suffix) {
            return `${release_version}-${prerelease_version}.${build_suffix}`;
        }
        return `${release_version}-${prerelease_version}`;
    }

    if (build_suffix) {
        return `${release_version}-${build_suffix}`;
    }

    return release_version;
}

/**
 * Generates a simpler version scheme used for some packages and prereleases.
 */
export function getSimpleVersion(fileVersion: string, argBuildNum: string, argRelease: boolean, patch: boolean) {
    // Azure DevOp pass in the build number as $(buildNum).$(buildAttempt).
    // Get the Build number and ignore the attempt number.
    const buildId = patch ? parseInt(argBuildNum.split('.')[0]) : undefined;

    if(isInternalVersionScheme(fileVersion, /* allowPrereleases */ true)) {
        if(patch) {
            throw new Error(`Cannot use simple patch versioning with Fluid internal versions. Version: ${fileVersion}`);
        }

        if(!argRelease) {
            fileVersion = changePreReleaseIdentifier(fileVersion, "dev");
        }
    }

    const { releaseVersion, prereleaseVersion } = parseFileVersion(fileVersion, buildId);
    const build_suffix = buildId ? "" : getBuildSuffix(argRelease, argBuildNum);
    const fullVersion = generateSimpleVersion(releaseVersion, prereleaseVersion, build_suffix);
    return fullVersion;
}

type TagPrefix = string | "client" | "server" | "azure" | "build-tools";

/**
 * @param prefix - The tag prefix to filter the tags by (client, server, etc.).
 * @param tags - An array of tags as strings.
 * @returns An array of tags that match the prefix.
 */
const filterTags = (prefix: TagPrefix, tags: string[]): string[] => tags.filter(v => v.startsWith(`${prefix}_v`));

/**
 * Extracts versions from the output of `git tag -l` in the working directory. The returned array will be sorted
 * ascending by semver version rules.
 *
 * @param prefix - The tag prefix to filter the tags by (client, server, etc.).
 * @returns An array of versions extracted from the output of `git tag -l`.
 */
function getVersions(prefix: TagPrefix) {
    const raw_tags = child_process.execSync(`git tag -l`, { encoding: "utf8" });
    const tags = raw_tags.split(/\s+/g).map(t => t.trim());
    return getVersionsFromStrings(prefix, tags);
}

/**
 * Extracts versions from an array of strings, sorts them according to semver rules, and returns the sorted array.
 *
 * @param prefix - The tag prefix to filter the tags by (client, server, etc.).
 * @param tags - An array of tags as strings.
 * @returns An array of versions extracted from the provided tags.
 */
export function getVersionsFromStrings(prefix: TagPrefix, tags: string[]) {
    const filtered = filterTags(prefix, tags);
    const versions = filtered.map((tag) => tag.substring(`${prefix}_v`.length));
    semver.sort(versions);
    return versions;
}

/**
 * @param prefix - The tag prefix to filter the tags by (client, server, etc.).
 * @param current_version - The version to test; that is, the version to check for being the latest build.
 * @param input_tags - If provided, only these tags will be considered. Mostly useful for testing.
 * @param includeInternalVersions - Whether to include Fluid internal builds, which are always
 * @returns true if the current version is to be considered the latest (higher than the tagged releases _and NOT_ a
 * pre-release version).
 */
export function getIsLatest(
    prefix: TagPrefix,
    current_version: string,
    input_tags?: string[],
    // eslint-disable-next-line default-param-last
    includeInternalVersions = false,
    log?: Logger,
) {
    let latestTaggedRelease: string;

    if(input_tags?.length === 0) {
        latestTaggedRelease = "0.0.0";
    }

    let versions = input_tags === undefined
        ? getVersions(prefix)
        : getVersionsFromStrings(prefix, input_tags);
    versions = versions.filter((v) => {
        if (v === undefined) {
            return false;
        }

        if (includeInternalVersions) {
            return true;
        }

        return !isInternalVersionScheme(v);
    });

    latestTaggedRelease = getLatestReleaseFromList(versions);
    if(versions.length === 0 || latestTaggedRelease === undefined) {
        latestTaggedRelease = "0.0.0";
    }

    log?.info(`Latest tagged: ${latestTaggedRelease}, current: ${current_version}`);
    const currentIsGreater = semver.gte(current_version, latestTaggedRelease);
    const currentIsPrerelease = includeInternalVersions
        ? detectVersionScheme(current_version) === "internalPrerelease"
        : semver.prerelease(current_version) !== null;

    return currentIsGreater && !currentIsPrerelease;
}
